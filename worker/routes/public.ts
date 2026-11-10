import { Hono } from 'hono';
import type { ClaimCreatedResponse, MineResponse, PublicChartResponse } from '../../shared/api-types';
import { publicClaimSchema, signInRequestSchema, signInVerifySchema } from '../../shared/schemas';
import { getProgress } from '../domain/campaigns';
import { createClaims, getChart } from '../domain/claims';
import { INVALID_CODE_MESSAGE, issueCode, verifyCode } from '../domain/codes';
import { normalizeDetails, sendClaimConfirmation, toSubmissions } from '../domain/participants';
import { normalizeAddress } from '../domain/phone';
import {
  forgetTokens,
  loadPublicCampaign,
  rememberToken,
  rememberedTokens,
  resolvePortion,
  toPublicCampaign,
} from '../domain/portion';
import { HOUR, enforceRateLimit } from '../domain/rate-limit';
import { signManageToken, signSignInToken, tokenSecret } from '../domain/tokens';
import { AppError, clientIp, parseBody, type AppEnv } from '../lib/http';
import { chooseChannel, dispatch } from '../messaging/dispatch';
import { participantCode } from '../messaging/templates';
import { campaignText } from '../domain/campaigns';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/campaigns/:slug', async (c) => {
  const campaign = await loadPublicCampaign(c.env, c.req.param('slug'));
  const body: PublicChartResponse = {
    campaign: toPublicCampaign(campaign),
    progress: await getProgress(c.env, campaign),
    masechtos: await getChart(c.env, campaign.id),
  };
  c.header('Cache-Control', 'no-store');
  return c.json(body);
});

publicRoutes.post('/campaigns/:slug/claims', async (c) => {
  const campaign = await loadPublicCampaign(c.env, c.req.param('slug'));
  const input = await parseBody(c, publicClaimSchema);
  const details = normalizeDetails(input, campaign.timezone);
  await enforceRateLimit(c.env, `claim:ip:${clientIp(c)}`, 10, HOUR);

  const { participantId } = await createClaims(c.env, campaign, details, input.masechtaIds, 'public');

  const manageToken = await signManageToken(tokenSecret(c.env), participantId);
  rememberToken(c, campaign.slug, manageToken);

  const to = chooseChannel(details);
  if (to) await sendClaimConfirmation(c.env, campaign, participantId, to);

  const body: ClaimCreatedResponse = { manageToken, masechtaIds: input.masechtaIds, notified: to !== null };
  return c.json(body, 201);
});

const badAddress = () => {
  const message = 'Enter the phone number or email you gave when you took a masechta.';
  return new AppError(400, 'validation', message, { fields: { address: message } });
};

publicRoutes.post('/campaigns/:slug/sign-in/request-code', async (c) => {
  const campaign = await loadPublicCampaign(c.env, c.req.param('slug'));
  const input = await parseBody(c, signInRequestSchema);
  const address = normalizeAddress(input.address, campaign.timezone);
  if (!address) throw badAddress();

  await enforceRateLimit(c.env, `signin:ip:${clientIp(c)}`, 20, HOUR);
  await enforceRateLimit(c.env, `signin:address:${campaign.id}:${address.address}`, 5, HOUR);

  // A code goes out only if someone in this campaign gave this address. The
  // response is the same either way, so the form cannot be used to look people up.
  const column = address.channel === 'sms' ? 'phone' : 'email';
  const known = await c.env.DB.prepare(`SELECT 1 FROM participants WHERE campaign_id = ? AND ${column} = ? LIMIT 1`)
    .bind(campaign.id, address.address)
    .first();
  if (known) {
    const scope = { kind: 'participant', campaignId: campaign.id, ...address } as const;
    const code = await issueCode(c.env, scope);
    await dispatch(c.env, {
      campaignId: campaign.id,
      channel: address.channel,
      to: address.address,
      template: 'participant_code',
      ...participantCode(address.channel, { code, campaign: campaignText(campaign) }),
    });
  }
  return c.json({ ok: true });
});

publicRoutes.post('/campaigns/:slug/sign-in/verify', async (c) => {
  const campaign = await loadPublicCampaign(c.env, c.req.param('slug'));
  const input = await parseBody(c, signInVerifySchema);
  const address = normalizeAddress(input.address, campaign.timezone);
  if (!address) throw badAddress();
  await enforceRateLimit(c.env, `signin-verify:ip:${clientIp(c)}`, 30, HOUR);

  const scope = { kind: 'participant', campaignId: campaign.id, ...address } as const;
  if (!(await verifyCode(c.env, scope, input.code))) {
    throw new AppError(400, 'invalid_code', INVALID_CODE_MESSAGE, { fields: { code: INVALID_CODE_MESSAGE } });
  }

  const token = await signSignInToken(tokenSecret(c.env), { campaignId: campaign.id, ...address });
  rememberToken(c, campaign.slug, token);
  return c.json({ token });
});

publicRoutes.get('/campaigns/:slug/mine', async (c) => {
  const campaign = await loadPublicCampaign(c.env, c.req.param('slug'));
  const secret = tokenSecret(c.env);
  const seen = new Set<string>();
  const body: MineResponse = { submissions: [] };

  for (const token of rememberedTokens(c)) {
    // A tampered token resolves to nothing; one from another campaign is skipped.
    const portion = await resolvePortion(c.env, token);
    if (!portion || portion.campaign.id !== campaign.id) continue;
    for (const submission of await toSubmissions(c.env, portion.participants)) {
      if (seen.has(submission.participantId) || submission.claims.length === 0) continue;
      seen.add(submission.participantId);
      body.submissions.push({
        manageToken: await signManageToken(secret, submission.participantId),
        masechtos: submission.claims.map((claim) => ({ masechtaId: claim.masechtaId, status: claim.status })),
      });
    }
  }
  c.header('Cache-Control', 'no-store');
  return c.json(body);
});

publicRoutes.delete('/campaigns/:slug/mine', async (c) => {
  forgetTokens(c, c.req.param('slug'));
  c.header('Cache-Control', 'no-store');
  return c.json({ ok: true });
});

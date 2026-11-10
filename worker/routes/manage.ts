import { Hono } from 'hono';
import type { ParticipantUpdatedResponse, PortionResponse } from '../../shared/api-types';
import { participantDetailsSchema } from '../../shared/schemas';
import { setClaimStatus, type ClaimStatus } from '../domain/claims';
import { normalizeDetails, toSubmissions, updateParticipant } from '../domain/participants';
import { resolvePortion, toPublicCampaign, type Portion } from '../domain/portion';
import { HOUR, enforceRateLimit } from '../domain/rate-limit';
import { signManageToken, tokenSecret } from '../domain/tokens';
import { clientIp, notFound, parseBody, type AppEnv } from '../lib/http';

export const manageRoutes = new Hono<AppEnv>();

async function load(env: Env, token: string): Promise<Portion> {
  const portion = await resolvePortion(env, token);
  if (!portion) throw notFound('This link is not valid. Check that it was copied in full.');
  return portion;
}

manageRoutes.get('/:token', async (c) => {
  const portion = await load(c.env, c.req.param('token'));
  const body: PortionResponse = {
    campaign: toPublicCampaign(portion.campaign),
    submissions: await toSubmissions(c.env, portion.participants),
  };
  c.header('Cache-Control', 'no-store');
  return c.json(body);
});

/** Changes a claim after confirming it belongs to a submission this token opens. */
async function changeClaim(env: Env, token: string, claimId: string, status: ClaimStatus) {
  const portion = await load(env, token);
  const owned = await env.DB.prepare(
    `SELECT 1 FROM claims WHERE id = ? AND participant_id IN (${portion.participants.map(() => '?').join(', ')})`,
  )
    .bind(claimId, ...portion.participants.map((p) => p.id))
    .first();
  if (!owned) throw notFound('That masechta is not part of this page.');
  const claim = await setClaimStatus(env, portion.campaign, claimId, status);
  return { claim: { id: claim.id, masechtaId: claim.masechta_id, status: claim.status } };
}

manageRoutes.post('/:token/claims/:claimId/complete', async (c) =>
  c.json(await changeClaim(c.env, c.req.param('token'), c.req.param('claimId'), 'completed')),
);

// Undo for a masechta marked finished by mistake.
manageRoutes.post('/:token/claims/:claimId/reopen', async (c) =>
  c.json(await changeClaim(c.env, c.req.param('token'), c.req.param('claimId'), 'claimed')),
);

manageRoutes.post('/:token/claims/:claimId/release', async (c) =>
  c.json(await changeClaim(c.env, c.req.param('token'), c.req.param('claimId'), 'released')),
);

manageRoutes.patch('/:token/participants/:participantId', async (c) => {
  const portion = await load(c.env, c.req.param('token'));
  const participantId = c.req.param('participantId');
  if (!portion.participants.some((p) => p.id === participantId)) {
    throw notFound('That submission is not part of this page.');
  }
  const input = await parseBody(c, participantDetailsSchema);
  const details = normalizeDetails(input, portion.campaign.timezone);
  await enforceRateLimit(c.env, `manage-edit:ip:${clientIp(c)}`, 10, HOUR);

  const updated = await updateParticipant(c.env, portion.campaign, participantId, details);
  const [submission] = await toSubmissions(c.env, [updated]);
  const body: ParticipantUpdatedResponse = { submission: submission! };

  // A sign-in link is tied to one phone or email. If this edit took that
  // address off the submission, hand back a link that still opens it.
  if (portion.ref.kind === 'signin') {
    const current = portion.ref.channel === 'sms' ? updated.phone : updated.email;
    if (current !== portion.ref.address) body.manageToken = await signManageToken(tokenSecret(c.env), participantId);
  }
  return c.json(body);
});

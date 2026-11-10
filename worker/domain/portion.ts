import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { PublicCampaignDto } from '../../shared/api-types';
import { hebrewDate } from '../../shared/hebrew-date';
import { notFound, type AppEnv } from '../lib/http';
import type { Campaign } from './campaigns';
import type { Participant } from './participants';
import { cookieSecure } from './sessions';
import { tokenSecret, verifyPortionToken, type PortionRef } from './tokens';

/** Only these fields of a campaign are public. The title and owner are not. */
export function toPublicCampaign(campaign: Campaign): PublicCampaignDto {
  return {
    slug: campaign.slug,
    honoreeNameHe: campaign.honoree_name_he,
    honoreeNameEn: campaign.honoree_name_en,
    dedicationType: campaign.dedication_type,
    message: campaign.message,
    endDate: campaign.end_date,
    endDateHebrew: hebrewDate(campaign.end_date),
    timezone: campaign.timezone,
    status: campaign.status === 'completed' ? 'completed' : 'active',
  };
}

const isPublic = (campaign: Campaign | null): campaign is Campaign =>
  campaign !== null && (campaign.status === 'active' || campaign.status === 'completed');

/** The campaign behind a public link. Draft and archived campaigns do not exist as far as visitors can tell. */
export async function loadPublicCampaign(env: Pick<Env, 'DB'>, slug: string): Promise<Campaign> {
  const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE slug = ?').bind(slug).first<Campaign>();
  if (!isPublic(campaign)) throw notFound('This chart does not exist. Check that the link was copied in full.');
  return campaign;
}

export interface Portion {
  ref: PortionRef;
  campaign: Campaign;
  participants: Participant[];
}

/**
 * Resolves a my-portion token. A manage token opens one submission. A sign-in
 * token opens every submission in its campaign that has its phone or email.
 */
export async function resolvePortion(env: Pick<Env, 'DB' | 'TOKEN_SECRET'>, token: string): Promise<Portion | null> {
  const ref = await verifyPortionToken(tokenSecret(env), token);
  if (!ref) return null;

  let participants: Participant[];
  let campaignId: string;
  if (ref.kind === 'manage') {
    const participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
      .bind(ref.participantId)
      .first<Participant>();
    if (!participant) return null;
    participants = [participant];
    campaignId = participant.campaign_id;
  } else {
    const column = ref.channel === 'sms' ? 'phone' : 'email';
    const { results } = await env.DB.prepare(
      `SELECT * FROM participants WHERE campaign_id = ? AND ${column} = ? ORDER BY created_at, rowid`,
    )
      .bind(ref.campaignId, ref.address)
      .all<Participant>();
    if (results.length === 0) return null;
    participants = results;
    campaignId = ref.campaignId;
  }

  const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(campaignId).first<Campaign>();
  return isPublic(campaign) ? { ref, campaign, participants } : null;
}

// Device memory: a cookie scoped to one campaign's public API path, holding
// the newest tokens used on this phone.

const COOKIE = 'portion';
const MAX_TOKENS = 10;
const cookiePath = (slug: string) => `/api/public/campaigns/${slug}`;

export function rememberedTokens(c: Context<AppEnv>): string[] {
  return (getCookie(c, COOKIE) ?? '').split(',').filter(Boolean).slice(0, MAX_TOKENS);
}

export function rememberToken(c: Context<AppEnv>, slug: string, token: string): void {
  const tokens = [token, ...rememberedTokens(c).filter((t) => t !== token)].slice(0, MAX_TOKENS);
  setCookie(c, COOKIE, tokens.join(','), {
    path: cookiePath(slug),
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Lax',
    maxAge: 365 * 86_400,
  });
}

export function forgetTokens(c: Context<AppEnv>, slug: string): void {
  deleteCookie(c, COOKIE, { path: cookiePath(slug), secure: cookieSecure(c) });
}

import type { z } from 'zod';
import type { PortionSubmission } from '../../shared/api-types';
import type { participantDetailsSchema } from '../../shared/schemas';
import { compareMasechtos, getMasechta } from '../../shared/shas';
import { AppError, notFound } from '../lib/http';
import { dispatch } from '../messaging/dispatch';
import { portionUrl, unsubscribeUrl } from '../messaging/links';
import { claimConfirmation } from '../messaging/templates';
import type { Channel } from '../messaging/types';
import { campaignText, type Campaign } from './campaigns';
import { normalizeEmail, normalizePhone } from './phone';
import { signManageToken, tokenSecret } from './tokens';

export interface Participant {
  id: string;
  campaign_id: string;
  name: string;
  is_anonymous: number;
  phone: string | null;
  email: string | null;
  source: 'public' | 'organizer';
  created_at: string;
}

export interface Details {
  name: string;
  phone: string | null;
  email: string | null;
  isAnonymous: boolean;
}

/**
 * Checks and normalizes a submission's details. Phone and email are optional,
 * and rejected only when given and not valid.
 */
export function normalizeDetails(input: z.infer<typeof participantDetailsSchema>, timezone: string): Details {
  const fields: Record<string, string> = {};
  let phone: string | null = null;
  let email: string | null = null;
  if (input.phone) {
    phone = normalizePhone(input.phone, timezone);
    if (!phone) fields.phone = 'This phone number does not look right. Check it, or leave it blank.';
  }
  if (input.email) {
    email = normalizeEmail(input.email);
    if (!email) fields.email = 'This email address does not look right. Check it, or leave it blank.';
  }
  const first = Object.values(fields)[0];
  if (first) throw new AppError(400, 'validation', first, { fields });
  return { name: input.name, phone, email, isAnonymous: input.isAnonymous };
}

export const displayName = (participant: Pick<Participant, 'name' | 'is_anonymous'>) =>
  participant.is_anonymous ? 'Anonymous' : participant.name;

/** The names of the masechtos a participant currently holds, in Shas order. */
async function liveMasechtaNames(env: Pick<Env, 'DB'>, participantId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT masechta_id FROM claims WHERE participant_id = ? AND status <> 'released'`,
  )
    .bind(participantId)
    .all<{ masechta_id: string }>();
  return results
    .map((row) => row.masechta_id)
    .sort(compareMasechtos)
    .map((id) => getMasechta(id)?.en ?? id);
}

/** Sends one person their my-portion link, listing what they hold. */
export async function sendClaimConfirmation(
  env: Env,
  campaign: Campaign,
  participantId: string,
  to: { channel: Channel; address: string },
): Promise<void> {
  const text = claimConfirmation(to.channel, {
    campaign: campaignText(campaign),
    masechtos: await liveMasechtaNames(env, participantId),
    portionUrl: portionUrl(env, await signManageToken(tokenSecret(env), participantId)),
    unsubscribeUrl: await unsubscribeUrl(env, to),
  });
  await dispatch(env, { campaignId: campaign.id, channel: to.channel, to: to.address, template: 'claim_confirmation', ...text });
}

/**
 * Saves one submission's details, for both the my-portion page and the
 * organizer. A phone or email that was added or changed is sent the link:
 * one message, to the phone if that changed, otherwise to the email.
 */
export async function updateParticipant(
  env: Env,
  campaign: Campaign,
  participantId: string,
  details: Details,
): Promise<Participant> {
  const before = await env.DB.prepare('SELECT * FROM participants WHERE id = ? AND campaign_id = ?')
    .bind(participantId, campaign.id)
    .first<Participant>();
  if (!before) throw notFound('That person is not part of this campaign.');

  await env.DB.prepare('UPDATE participants SET name = ?, phone = ?, email = ?, is_anonymous = ? WHERE id = ?')
    .bind(details.name, details.phone, details.email, details.isAnonymous ? 1 : 0, participantId)
    .run();

  if (details.phone && details.phone !== before.phone) {
    await sendClaimConfirmation(env, campaign, participantId, { channel: 'sms', address: details.phone });
  } else if (details.email && details.email !== before.email) {
    await sendClaimConfirmation(env, campaign, participantId, { channel: 'email', address: details.email });
  }

  return { ...before, name: details.name, phone: details.phone, email: details.email, is_anonymous: details.isAnonymous ? 1 : 0 };
}

interface LiveClaim {
  id: string;
  participant_id: string;
  masechta_id: string;
  status: 'claimed' | 'completed';
}

/** Submissions with their live claims, as shown to their owner. */
export async function toSubmissions(env: Pick<Env, 'DB'>, participants: Participant[]): Promise<PortionSubmission[]> {
  if (participants.length === 0) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, participant_id, masechta_id, status FROM claims
     WHERE status <> 'released' AND participant_id IN (${participants.map(() => '?').join(', ')})`,
  )
    .bind(...participants.map((p) => p.id))
    .all<LiveClaim>();
  return participants.map((p) => ({
    participantId: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email,
    isAnonymous: p.is_anonymous === 1,
    claims: results
      .filter((claim) => claim.participant_id === p.id)
      .sort((a, b) => compareMasechtos(a.masechta_id, b.masechta_id))
      .map((claim) => ({
        id: claim.id,
        masechtaId: claim.masechta_id,
        status: claim.status === 'completed' ? ('finished' as const) : ('taken' as const),
      })),
  }));
}

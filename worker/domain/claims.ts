import type { ChartEntry } from '../../shared/api-types';
import { TOTAL_MASECHTOS, compareMasechtos, getMasechta } from '../../shared/shas';
import { AppError, notFound } from '../lib/http';
import { dispatch } from '../messaging/dispatch';
import { dashboardUrl, unsubscribeUrl } from '../messaging/links';
import { campaignComplete } from '../messaging/templates';
import { campaignText, type Campaign } from './campaigns';
import type { Details } from './participants';

export type ClaimStatus = 'claimed' | 'completed' | 'released';

export interface Claim {
  id: string;
  campaign_id: string;
  participant_id: string;
  masechta_id: string;
  status: ClaimStatus;
  claimed_at: string;
  completed_at: string | null;
  released_at: string | null;
}

/** The chart: every masechta that is not open, with its holder's display name. */
export async function getChart(env: Pick<Env, 'DB'>, campaignId: string): Promise<ChartEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT claims.masechta_id, claims.status, participants.name, participants.is_anonymous
     FROM claims JOIN participants ON participants.id = claims.participant_id
     WHERE claims.campaign_id = ? AND claims.status <> 'released'`,
  )
    .bind(campaignId)
    .all<{ masechta_id: string; status: 'claimed' | 'completed'; name: string; is_anonymous: number }>();
  // Built field by field: the real name of an anonymous person, and every
  // phone and email, never enter this payload.
  return results
    .sort((a, b) => compareMasechtos(a.masechta_id, b.masechta_id))
    .map((row) => ({
      masechtaId: row.masechta_id,
      status: row.status === 'completed' ? 'finished' : 'taken',
      name: row.is_anonymous ? 'Anonymous' : row.name,
    }));
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Creates one submission: a participant and all their claims in a single
 * `batch()`, which D1 runs as one transaction. If any masechta is already
 * held, the unique index rejects the batch and nothing at all is written.
 */
export async function createClaims(
  env: Pick<Env, 'DB'>,
  campaign: Campaign,
  details: Details,
  masechtaIds: string[],
  source: 'public' | 'organizer',
): Promise<{ participantId: string }> {
  if (campaign.status !== 'active') {
    throw new AppError(
      409,
      'not_active',
      campaign.status === 'completed'
        ? 'Every masechta has been finished, so there is nothing left to take.'
        : 'This campaign is not open for taking masechtos.',
    );
  }

  const participantId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO participants (id, campaign_id, name, is_anonymous, phone, email, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(participantId, campaign.id, details.name, details.isAnonymous ? 1 : 0, details.phone, details.email, source, now),
      ...masechtaIds.map((masechtaId) =>
        env.DB.prepare(
          `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at)
           VALUES (?, ?, ?, ?, 'claimed', ?)`,
        ).bind(crypto.randomUUID(), campaign.id, participantId, masechtaId, now),
      ),
    ]);
  } catch (error) {
    if (!String(error).includes('UNIQUE')) throw error;
    const { results } = await env.DB.prepare(
      `SELECT masechta_id FROM claims WHERE campaign_id = ? AND status <> 'released'
       AND masechta_id IN (${masechtaIds.map(() => '?').join(', ')})`,
    )
      .bind(campaign.id, ...masechtaIds)
      .all<{ masechta_id: string }>();
    const conflicts = results.map((row) => row.masechta_id).sort(compareMasechtos);
    const names = list(conflicts.map((id) => getMasechta(id)?.en ?? id));
    const rest =
      conflicts.length < masechtaIds.length ? ' Your other choices are still selected.' : ' Please choose another.';
    throw new AppError(409, 'conflict', `Someone just took ${names || 'one of these'}.${rest}`, { conflicts });
  }
  return { participantId };
}

/**
 * Changes one claim. Finished and taken can go back and forth; released is final.
 * Then checks whether all of Shas is now finished, or no longer is.
 */
export async function setClaimStatus(env: Env, campaign: Campaign, claimId: string, status: ClaimStatus): Promise<Claim> {
  if (campaign.status !== 'active' && campaign.status !== 'completed') {
    throw new AppError(409, 'not_active', 'This campaign is not open.');
  }
  const claim = await env.DB.prepare('SELECT * FROM claims WHERE id = ? AND campaign_id = ?')
    .bind(claimId, campaign.id)
    .first<Claim>();
  if (!claim || claim.status === 'released') throw notFound('That masechta is no longer held.');
  if (claim.status === status) return claim;

  const now = new Date().toISOString();
  const completedAt = status === 'completed' ? now : null;
  const releasedAt = status === 'released' ? now : null;
  // The status check in WHERE keeps a stale request from reviving a released claim.
  await env.DB.prepare(
    `UPDATE claims SET status = ?, completed_at = ?, released_at = ? WHERE id = ? AND status <> 'released'`,
  )
    .bind(status, completedAt, releasedAt, claimId)
    .run();

  await syncCompletion(env, campaign);
  return { ...claim, status, completed_at: completedAt, released_at: releasedAt };
}

/** Moves the campaign between `active` and `completed` to match the chart, and tells the organizer once. */
export async function syncCompletion(env: Env, campaign: Campaign): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM claims WHERE campaign_id = ? AND status = 'completed'`,
  )
    .bind(campaign.id)
    .first<{ n: number }>();
  const allFinished = (row?.n ?? 0) >= TOTAL_MASECHTOS;
  const now = new Date().toISOString();

  if (allFinished) {
    const changed = await env.DB.prepare(
      `UPDATE campaigns SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'active'`,
    )
      .bind(now, now, campaign.id)
      .run();
    if (changed.meta.changes === 0) return;

    const owner = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
      .bind(campaign.owner_user_id)
      .first<{ email: string }>();
    if (!owner) return;
    const to = { channel: 'email', address: owner.email } as const;
    await dispatch(env, {
      campaignId: campaign.id,
      channel: 'email',
      to: owner.email,
      template: 'campaign_complete',
      // One notice per campaign, even if a masechta is undone and finished again.
      dedupeKey: `complete:${campaign.id}`,
      ...campaignComplete('email', {
        campaign: campaignText(campaign),
        dashboardUrl: dashboardUrl(env, campaign.id),
        unsubscribeUrl: await unsubscribeUrl(env, to),
      }),
    });
  } else {
    await env.DB.prepare(
      `UPDATE campaigns SET status = 'active', completed_at = NULL, updated_at = ? WHERE id = ? AND status = 'completed'`,
    )
      .bind(now, campaign.id)
      .run();
  }
}

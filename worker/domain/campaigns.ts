import type { CampaignDto, CampaignStatus, Progress } from '../../shared/api-types';
import type { DedicationType } from '../../shared/dedication';
import { TOTAL_MASECHTOS } from '../../shared/shas';

export type { CampaignStatus };

/** A row of the `campaigns` table. */
export interface Campaign {
  id: string;
  owner_user_id: string;
  slug: string;
  honoree_name: string;
  dedication_type: DedicationType;
  message: string | null;
  end_date: string;
  timezone: string;
  status: CampaignStatus;
  activated_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function campaignText(campaign: Campaign) {
  return {
    honoreeName: campaign.honoree_name,
    dedicationType: campaign.dedication_type,
  };
}

// Letters and digits that cannot be mistaken for each other when read off a
// printed sign: no 0/O, no 1/l/I.
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SLUG_LENGTH = 8;

export function generateSlug(): string {
  const limit = 256 - (256 % SLUG_ALPHABET.length);
  let slug = '';
  while (slug.length < SLUG_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(SLUG_LENGTH * 2))) {
      if (byte < limit && slug.length < SLUG_LENGTH) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
    }
  }
  return slug;
}

const emptyProgress = (): Progress => ({ finished: 0, taken: 0, open: TOTAL_MASECHTOS, total: TOTAL_MASECHTOS });

/** Counts for several campaigns in one query. Released claims are not counted, so their masechtos are open. */
export async function getProgressFor(env: Pick<Env, 'DB'>, campaignIds: string[]): Promise<Map<string, Progress>> {
  const progress = new Map(campaignIds.map((id) => [id, emptyProgress()]));
  if (campaignIds.length === 0) return progress;
  const { results } = await env.DB.prepare(
    `SELECT campaign_id, status, COUNT(*) AS n FROM claims
     WHERE status <> 'released' AND campaign_id IN (${campaignIds.map(() => '?').join(', ')})
     GROUP BY campaign_id, status`,
  )
    .bind(...campaignIds)
    .all<{ campaign_id: string; status: 'claimed' | 'completed'; n: number }>();
  for (const row of results) {
    const entry = progress.get(row.campaign_id);
    if (!entry) continue;
    if (row.status === 'completed') entry.finished = row.n;
    else entry.taken = row.n;
    entry.open = entry.total - entry.finished - entry.taken;
  }
  return progress;
}

export async function getProgress(env: Pick<Env, 'DB'>, campaign: Pick<Campaign, 'id'>): Promise<Progress> {
  return (await getProgressFor(env, [campaign.id])).get(campaign.id) ?? emptyProgress();
}

export function toCampaignDto(campaign: Campaign, progress: Progress): CampaignDto {
  return {
    id: campaign.id,
    slug: campaign.slug,
    honoreeName: campaign.honoree_name,
    dedicationType: campaign.dedication_type,
    message: campaign.message,
    endDate: campaign.end_date,
    timezone: campaign.timezone,
    status: campaign.status,
    activatedOn: campaign.activated_on,
    completedAt: campaign.completed_at,
    createdAt: campaign.created_at,
    progress,
  };
}

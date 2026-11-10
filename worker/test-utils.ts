import { env } from 'cloudflare:workers';

/** Small factories for tests. Each inserts one row and returns it. */

const now = () => new Date().toISOString();

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export async function createUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
  const id = overrides.id ?? crypto.randomUUID();
  const row: UserRow = {
    id,
    email: `organizer-${id.slice(0, 8)}@example.com`,
    name: null,
    created_at: now(),
    ...overrides,
  };
  await env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(row.id, row.email, row.name, row.created_at)
    .run();
  return row;
}

export interface CampaignRow {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  honoree_name: string;
  dedication_type: 'ilui_nishmas' | 'refuah_shleima' | 'zechus' | 'other';
  message: string | null;
  end_date: string;
  timezone: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  activated_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createCampaign(overrides: Partial<CampaignRow> = {}): Promise<CampaignRow> {
  const id = overrides.id ?? crypto.randomUUID();
  const owner = overrides.owner_user_id ?? (await createUser()).id;
  const row: CampaignRow = {
    id,
    owner_user_id: owner,
    slug: id.slice(0, 8),
    title: 'Mishnayos for Naftali',
    honoree_name: 'נפתלי בן יעקב',
    dedication_type: 'ilui_nishmas',
    message: null,
    end_date: '2030-01-31',
    timezone: 'America/New_York',
    status: 'active',
    activated_on: '2030-01-01',
    completed_at: null,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
  await env.DB.prepare(
    `INSERT INTO campaigns (id, owner_user_id, slug, title, honoree_name, dedication_type,
       message, end_date, timezone, status, activated_on, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id, row.owner_user_id, row.slug, row.title, row.honoree_name,
      row.dedication_type, row.message, row.end_date, row.timezone, row.status, row.activated_on,
      row.completed_at, row.created_at, row.updated_at,
    )
    .run();
  return row;
}

export interface ParticipantRow {
  id: string;
  campaign_id: string;
  name: string;
  is_anonymous: number;
  phone: string | null;
  email: string | null;
  source: 'public' | 'organizer';
  created_at: string;
}

export async function createParticipant(
  overrides: Partial<ParticipantRow> & { campaign_id: string },
): Promise<ParticipantRow> {
  const row: ParticipantRow = {
    id: crypto.randomUUID(),
    name: 'Moshe Katz',
    is_anonymous: 0,
    phone: null,
    email: null,
    source: 'public',
    created_at: now(),
    ...overrides,
  };
  await env.DB.prepare(
    `INSERT INTO participants (id, campaign_id, name, is_anonymous, phone, email, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.campaign_id, row.name, row.is_anonymous, row.phone, row.email, row.source, row.created_at)
    .run();
  return row;
}

export interface ClaimRow {
  id: string;
  campaign_id: string;
  participant_id: string;
  masechta_id: string;
  status: 'claimed' | 'completed' | 'released';
  claimed_at: string;
  completed_at: string | null;
  released_at: string | null;
}

export async function createClaim(
  overrides: Partial<ClaimRow> & { campaign_id: string; participant_id: string; masechta_id: string },
): Promise<ClaimRow> {
  const status = overrides.status ?? 'claimed';
  const row: ClaimRow = {
    id: crypto.randomUUID(),
    status,
    claimed_at: now(),
    completed_at: status === 'completed' ? now() : null,
    released_at: status === 'released' ? now() : null,
    ...overrides,
  };
  await env.DB.prepare(
    `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at, completed_at, released_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id, row.campaign_id, row.participant_id, row.masechta_id, row.status,
      row.claimed_at, row.completed_at, row.released_at,
    )
    .run();
  return row;
}

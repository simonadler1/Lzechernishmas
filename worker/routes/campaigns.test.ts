import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CampaignDto } from '../../shared/api-types';
import { addDays, localDate } from '../../shared/dates';
import { generateSlug, getProgress } from '../domain/campaigns';
import { TestClient, loginAs } from '../test-http';
import { createCampaign, createClaim, createParticipant } from '../test-utils';

const today = (timezone = 'America/New_York') => localDate(new Date(), timezone);

const input = (overrides: Record<string, unknown> = {}) => ({
  title: 'Mishnayos for Zeidy',
  honoreeName: 'נפתלי בן יעקב',
  dedicationType: 'ilui_nishmas',
  message: 'Please finish by the shloshim.',
  endDate: addDays(today(), 30),
  timezone: 'America/New_York',
  ...overrides,
});

async function create(client: TestClient, overrides: Record<string, unknown> = {}): Promise<CampaignDto> {
  const res = await client.post('/api/campaigns', input(overrides));
  expect(res.status).toBe(201);
  return (await res.json<{ campaign: CampaignDto }>()).campaign;
}

describe('campaign API', () => {
  it('creates a draft with a slug and full progress', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);
    expect(campaign).toMatchObject({
      title: 'Mishnayos for Zeidy',
      honoreeName: 'נפתלי בן יעקב',
      status: 'draft',
      activatedOn: null,
      progress: { finished: 0, taken: 0, open: 63, total: 63 },
    });
    expect(campaign.slug).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  });

  it('takes the name in Hebrew or in English', async () => {
    const client = await loginAs('a@example.com');
    expect((await create(client, { honoreeName: '  Naftali ben Yaakov ' })).honoreeName).toBe('Naftali ben Yaakov');
    expect((await create(client, { honoreeName: 'נפתלי בן יעקב ע״ה' })).honoreeName).toBe('נפתלי בן יעקב ע״ה');
  });

  it('needs no timezone: it uses the one the page sends, or New York when none is sent', async () => {
    const client = await loginAs('a@example.com');
    const res = await client.post('/api/campaigns', input({ timezone: undefined }));
    expect(res.status).toBe(201);
    expect((await res.json<{ campaign: CampaignDto }>()).campaign.timezone).toBe('America/New_York');
    expect((await create(client, { timezone: 'Asia/Jerusalem', endDate: addDays(today('Asia/Jerusalem'), 30) })).timezone).toBe('Asia/Jerusalem');

    // Editing without a timezone leaves it alone.
    const campaign = await create(client, { timezone: 'Europe/London' });
    const patched = await client.patch(`/api/campaigns/${campaign.id}`, { title: 'Renamed' });
    expect((await patched.json<{ campaign: CampaignDto }>()).campaign.timezone).toBe('Europe/London');
  });

  it('reads, lists and updates', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);

    const read = await client.get(`/api/campaigns/${campaign.id}`);
    expect((await read.json<{ campaign: CampaignDto }>()).campaign.id).toBe(campaign.id);

    const list = await client.get('/api/campaigns');
    expect((await list.json<{ campaigns: CampaignDto[] }>()).campaigns.map((c) => c.id)).toEqual([campaign.id]);

    const patch = await client.patch(`/api/campaigns/${campaign.id}`, { title: 'New title' });
    expect(patch.status).toBe(200);
    expect((await patch.json<{ campaign: CampaignDto }>()).campaign).toMatchObject({
      title: 'New title',
      honoreeName: 'נפתלי בן יעקב',
      message: 'Please finish by the shloshim.',
    });
  });

  it('activates a draft and records the campaign-local date', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client, { timezone: 'Asia/Jerusalem', endDate: addDays(today('Asia/Jerusalem'), 20) });
    const res = await client.post(`/api/campaigns/${campaign.id}/activate`);
    expect(res.status).toBe(200);
    expect((await res.json<{ campaign: CampaignDto }>()).campaign).toMatchObject({
      status: 'active',
      activatedOn: today('Asia/Jerusalem'),
    });
    expect((await client.post(`/api/campaigns/${campaign.id}/activate`)).status).toBe(409);
  });

  it('refuses to activate once the target date is today or earlier', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);
    await env.DB.prepare('UPDATE campaigns SET end_date = ? WHERE id = ?').bind(today(), campaign.id).run();
    const res = await client.post(`/api/campaigns/${campaign.id}/activate`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { fields: { endDate: expect.any(String) } } });
  });

  it('archives from any state, and an archived campaign cannot be edited', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);
    const res = await client.post(`/api/campaigns/${campaign.id}/archive`);
    expect((await res.json<{ campaign: CampaignDto }>()).campaign.status).toBe('archived');
    expect((await client.patch(`/api/campaigns/${campaign.id}`, { title: 'x' })).status).toBe(409);
  });

  it('allows moving the end date after activation', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);
    await client.post(`/api/campaigns/${campaign.id}/activate`);
    const later = addDays(today(), 60);
    const res = await client.patch(`/api/campaigns/${campaign.id}`, { endDate: later });
    expect(res.status).toBe(200);
    expect((await res.json<{ campaign: CampaignDto }>()).campaign).toMatchObject({ endDate: later, status: 'active' });
  });

  it.each([
    ['an impossible date', { endDate: '2030-02-30' }, 'endDate'],
    ['a malformed date', { endDate: '31/01/2030' }, 'endDate'],
    ['today', { endDate: today() }, 'endDate'],
    ['a past date', { endDate: '2020-01-01' }, 'endDate'],
    ['an unknown timezone', { timezone: 'Mars/Olympus' }, 'timezone'],
    ['an empty timezone', { timezone: '' }, 'timezone'],
    ['a missing name', { honoreeName: '  ' }, 'honoreeName'],
    ['a name over 120 characters', { honoreeName: 'א'.repeat(121) }, 'honoreeName'],
    ['an unknown dedication', { dedicationType: 'birthday' }, 'dedicationType'],
    ['a missing title', { title: '' }, 'title'],
  ])('rejects %s', async (_name, overrides, field) => {
    const client = await loginAs('a@example.com');
    const res = await client.post('/api/campaigns', input(overrides));
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>();
    expect(body.error.code).toBe('validation');
    expect(body.error.fields[field]).toBeTruthy();
  });

  it('rejects a bad date or timezone on update', async () => {
    const client = await loginAs('a@example.com');
    const campaign = await create(client);
    expect((await client.patch(`/api/campaigns/${campaign.id}`, { endDate: '2020-01-01' })).status).toBe(400);
    expect((await client.patch(`/api/campaigns/${campaign.id}`, { timezone: 'Nope/Nope' })).status).toBe(400);
  });

  it("answers 404 for another user's campaign on every route", async () => {
    const owner = await loginAs('owner@example.com');
    const campaign = await create(owner);
    const other = await loginAs('other@example.com');
    const base = `/api/campaigns/${campaign.id}`;
    expect((await other.get(base)).status).toBe(404);
    expect((await other.patch(base, { title: 'Mine now' })).status).toBe(404);
    expect((await other.post(`${base}/activate`)).status).toBe(404);
    expect((await other.post(`${base}/archive`)).status).toBe(404);
    expect((await other.get('/api/campaigns/does-not-exist')).status).toBe(404);
    expect((await (await other.get('/api/campaigns')).json<{ campaigns: unknown[] }>()).campaigns).toEqual([]);
    expect((await (await owner.get(base)).json<{ campaign: CampaignDto }>()).campaign).toMatchObject({
      title: 'Mishnayos for Zeidy',
      status: 'draft',
    });
  });

  it('requires a session', async () => {
    const anonymous = new TestClient();
    expect((await anonymous.get('/api/campaigns')).status).toBe(401);
    expect((await anonymous.post('/api/campaigns', input())).status).toBe(401);
  });
});

describe('progress', () => {
  it('totals 63 and counts released claims as open', async () => {
    const campaign = await createCampaign();
    const person = await createParticipant({ campaign_id: campaign.id });
    const claim = (masechta_id: string, status: 'claimed' | 'completed' | 'released') =>
      createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id, status });
    await claim('berachos', 'completed');
    await claim('peah', 'claimed');
    await claim('demai', 'claimed');
    await claim('kilayim', 'released');
    expect(await getProgress(env, campaign)).toEqual({ finished: 1, taken: 2, open: 60, total: 63 });

    const other = await createCampaign();
    expect(await getProgress(env, other)).toEqual({ finished: 0, taken: 0, open: 63, total: 63 });
  });
});

describe('generateSlug', () => {
  it('uses 8 characters with no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const slug = generateSlug();
      expect(slug).toMatch(/^[a-z2-9]{8}$/);
      expect(slug).not.toMatch(/[01lio]/);
    }
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type {
  ClaimCreatedResponse,
  MineResponse,
  ParticipantUpdatedResponse,
  PortionResponse,
  PublicChartResponse,
} from '../../shared/api-types';
import { ALL_MASECHTOS } from '../../shared/shas';
import { signManageToken, signSignInToken, tokenSecret } from '../domain/tokens';
import { TestClient, lastCode, lastMessage, messagesTo, tamper } from '../test-http';
import { createCampaign, createClaim, createParticipant, createUser, type CampaignRow } from '../test-utils';

const PHONE = '+17185550123';

let nextIp = 1;
/** A visitor on their own phone: own cookies, own IP address. */
const visitor = () => new TestClient({ 'cf-connecting-ip': `198.51.100.${nextIp++}` });

const base = (campaign: CampaignRow) => `/api/public/campaigns/${campaign.slug}`;

async function take(client: TestClient, campaign: CampaignRow, body: Record<string, unknown>) {
  return client.post(`${base(campaign)}/claims`, { name: 'Moshe Katz', masechtaIds: ['peah'], ...body });
}

async function takeOk(client: TestClient, campaign: CampaignRow, body: Record<string, unknown> = {}) {
  const res = await take(client, campaign, body);
  expect(res.status).toBe(201);
  return res.json<ClaimCreatedResponse>();
}

const chart = async (campaign: CampaignRow) =>
  (await new TestClient().get(base(campaign))).json<PublicChartResponse>();

const portion = async (token: string) => (await new TestClient().get(`/api/manage/${token}`)).json<PortionResponse>();

const count = async (table: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;

async function signIn(client: TestClient, campaign: CampaignRow, address: string): Promise<string> {
  expect((await client.post(`${base(campaign)}/sign-in/request-code`, { address })).status).toBe(200);
  const normalized = address.includes('@') ? address.toLowerCase() : PHONE;
  const res = await client.post(`${base(campaign)}/sign-in/verify`, { address, code: await lastCode(normalized) });
  expect(res.status).toBe(200);
  return (await res.json<{ token: string }>()).token;
}

describe('public chart', () => {
  it('shows campaign fields, progress and only the masechtos that are not open', async () => {
    const campaign = await createCampaign({ title: 'Private title', message: 'Please finish.' });
    await takeOk(visitor(), campaign, { masechtaIds: ['peah', 'demai'] });
    const body = await chart(campaign);
    expect(body.campaign).toMatchObject({
      slug: campaign.slug,
      honoreeNameHe: 'נפתלי בן יעקב',
      message: 'Please finish.',
      status: 'active',
      endDateHebrew: expect.any(String),
    });
    expect(body.progress).toEqual({ finished: 0, taken: 2, open: 61, total: 63 });
    expect(body.masechtos).toEqual([
      { masechtaId: 'peah', status: 'taken', name: 'Moshe Katz' },
      { masechtaId: 'demai', status: 'taken', name: 'Moshe Katz' },
    ]);
    expect(JSON.stringify(body)).not.toContain('Private title');
  });

  it('is 404 for draft, archived and unknown campaigns', async () => {
    const draft = await createCampaign({ status: 'draft' });
    const archived = await createCampaign({ status: 'archived' });
    const client = new TestClient();
    expect((await client.get(base(draft))).status).toBe(404);
    expect((await client.get(base(archived))).status).toBe(404);
    expect((await client.get('/api/public/campaigns/nothing')).status).toBe(404);
    expect((await take(visitor(), draft, {})).status).toBe(404);
    expect((await client.post(`${base(archived)}/sign-in/request-code`, { address: PHONE })).status).toBe(404);
  });

  it('never contains a phone or email, and hides anonymous names on the server', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, {
      name: 'Secret Person',
      phone: '(718) 555-0123',
      email: 'secret@example.com',
      isAnonymous: true,
      masechtaIds: ['peah'],
    });
    await takeOk(visitor(), campaign, { name: 'Dovid Levi', email: 'dovid@example.com', masechtaIds: ['demai'] });
    const text = await (await new TestClient().get(base(campaign))).text();
    expect(text).not.toContain('5550123');
    expect(text).not.toContain('@');
    expect(text).not.toContain('Secret Person');
    expect(text).toContain('Anonymous');
    expect(text).toContain('Dovid Levi');
  });
});

describe('taking masechtos', () => {
  it('lets exactly one of 20 simultaneous submissions win a masechta', async () => {
    const campaign = await createCampaign();
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => take(visitor(), campaign, { name: `Person ${i}`, masechtaIds: ['keilim'] })),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    // No participant row is left behind by a losing submission.
    expect(await count('participants')).toBe(1);
    expect(await count('claims')).toBe(1);
  });

  it('creates nothing when one of two masechtos is taken, and names the conflict', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { masechtaIds: ['peah'] });
    const res = await take(visitor(), campaign, { name: 'Dovid Levi', masechtaIds: ['demai', 'peah'] });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string; message: string; conflicts: string[] } }>();
    expect(body.error).toMatchObject({ code: 'conflict', conflicts: ['peah'] });
    expect(body.error.message).toBe('Someone just took Peah. Your other choices are still selected.');
    expect(await count('participants')).toBe(1);
    expect((await chart(campaign)).masechtos.map((m) => m.masechtaId)).toEqual(['peah']);
  });

  it.each([
    ['no name', { name: '   ' }, 'name'],
    ['an invalid phone', { phone: '12345' }, 'phone'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['no masechtos', { masechtaIds: [] }, 'masechtaIds'],
    ['an unknown masechta', { masechtaIds: ['zeraim'] }, 'masechtaIds'],
    ['more than 10 masechtos', { masechtaIds: ALL_MASECHTOS.slice(0, 11).map((m) => m.id) }, 'masechtaIds'],
  ])('rejects %s', async (_name, body, field) => {
    const campaign = await createCampaign();
    const res = await take(visitor(), campaign, body);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { fields: Record<string, string> } }>()).error.fields[field]).toBeTruthy();
    expect(await count('participants')).toBe(0);
  });

  it('accepts a name alone, returns a working link, and sends nothing', async () => {
    const campaign = await createCampaign();
    const created = await takeOk(visitor(), campaign, { name: 'Just A Name' });
    expect(created.notified).toBe(false);
    expect(await count('outbound_messages')).toBe(0);
    const page = await portion(created.manageToken);
    expect(page.submissions).toHaveLength(1);
    expect(page.submissions[0]).toMatchObject({ name: 'Just A Name', phone: null, email: null });
    expect(page.submissions[0]?.claims.map((c) => c.masechtaId)).toEqual(['peah']);
  });

  it('sends the link by text when a phone is given, and by email otherwise', async () => {
    const campaign = await createCampaign();
    const withPhone = await takeOk(visitor(), campaign, { phone: '718-555-0123', email: 'm@example.com' });
    const sms = await lastMessage(PHONE);
    expect(sms).toMatchObject({ channel: 'sms', template: 'claim_confirmation' });
    expect(sms?.body).toContain(`/m/${withPhone.manageToken}`);
    expect(sms?.body).toContain('Peah');
    expect(await messagesTo('m@example.com')).toHaveLength(0);

    await takeOk(visitor(), campaign, { email: 'Other@Example.com', masechtaIds: ['demai'] });
    expect(await lastMessage('other@example.com')).toMatchObject({ channel: 'email', template: 'claim_confirmation' });
  });

  it('allows a released masechta to be taken again', async () => {
    const campaign = await createCampaign();
    const first = await takeOk(visitor(), campaign);
    const claimId = (await portion(first.manageToken)).submissions[0]!.claims[0]!.id;
    const release = await new TestClient().post(`/api/manage/${first.manageToken}/claims/${claimId}/release`);
    expect(release.status).toBe(200);
    expect((await chart(campaign)).masechtos).toEqual([]);
    await takeOk(visitor(), campaign, { name: 'Dovid Levi' });
    expect((await chart(campaign)).masechtos).toEqual([{ masechtaId: 'peah', status: 'taken', name: 'Dovid Levi' }]);
  });

  it('limits one IP to 10 submissions an hour', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    for (const m of ALL_MASECHTOS.slice(0, 10)) await takeOk(client, campaign, { masechtaIds: [m.id] });
    expect((await take(client, campaign, { masechtaIds: ['uktzin'] })).status).toBe(429);
  });

  it('refuses when the campaign is completed', async () => {
    const campaign = await createCampaign({ status: 'completed' });
    const res = await take(visitor(), campaign, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'not_active' } });
  });
});

describe('my portion', () => {
  it('marks finished, undoes it, and shows it on the chart', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const claimId = (await portion(manageToken)).submissions[0]!.claims[0]!.id;
    const client = new TestClient();
    expect((await client.post(`/api/manage/${manageToken}/claims/${claimId}/complete`)).status).toBe(200);
    expect((await chart(campaign)).masechtos[0]).toMatchObject({ status: 'finished' });
    expect((await client.post(`/api/manage/${manageToken}/claims/${claimId}/reopen`)).status).toBe(200);
    expect((await chart(campaign)).masechtos[0]).toMatchObject({ status: 'taken' });
  });

  it("cannot act on another participant's claim", async () => {
    const campaign = await createCampaign();
    const mine = await takeOk(visitor(), campaign);
    const theirs = await takeOk(visitor(), campaign, { name: 'Dovid Levi', masechtaIds: ['demai'] });
    const theirClaim = (await portion(theirs.manageToken)).submissions[0]!.claims[0]!.id;
    const client = new TestClient();
    for (const action of ['complete', 'reopen', 'release']) {
      expect((await client.post(`/api/manage/${mine.manageToken}/claims/${theirClaim}/${action}`)).status).toBe(404);
    }
    expect((await chart(campaign)).masechtos.find((m) => m.masechtaId === 'demai')).toMatchObject({ status: 'taken' });
  });

  it('rejects a tampered or unknown token', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const client = new TestClient();
    expect((await client.get(`/api/manage/${tamper(manageToken)}`)).status).toBe(404);
    expect((await client.get('/api/manage/nonsense')).status).toBe(404);
    const ghost = await signManageToken(tokenSecret(env), 'no-such-participant');
    expect((await client.get(`/api/manage/${ghost}`)).status).toBe(404);
  });

  it('stops working when the campaign is archived', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    await env.DB.prepare(`UPDATE campaigns SET status = 'archived' WHERE id = ?`).bind(campaign.id).run();
    expect((await new TestClient().get(`/api/manage/${manageToken}`)).status).toBe(404);
  });
});

describe('finishing all of Shas', () => {
  async function allButOne(campaign: CampaignRow) {
    const helper = await createParticipant({ campaign_id: campaign.id, name: 'Helper' });
    await env.DB.batch(
      ALL_MASECHTOS.filter((m) => m.id !== 'uktzin').map((m) =>
        env.DB.prepare(
          `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at, completed_at)
           VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
        ).bind(crypto.randomUUID(), campaign.id, helper.id, m.id, 'x', 'x'),
      ),
    );
  }

  it('completes the campaign, tells the organizer once, and reverts on undo', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const campaign = await createCampaign({ owner_user_id: owner.id });
    await allButOne(campaign);
    const { manageToken } = await takeOk(visitor(), campaign, { masechtaIds: ['uktzin'] });
    const claimId = (await portion(manageToken)).submissions[0]!.claims[0]!.id;
    const client = new TestClient();
    const status = async () =>
      (await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?').bind(campaign.id).first<{ status: string }>())
        ?.status;

    await client.post(`/api/manage/${manageToken}/claims/${claimId}/complete`);
    expect(await status()).toBe('completed');
    expect((await chart(campaign)).campaign.status).toBe('completed');
    expect((await chart(campaign)).progress).toEqual({ finished: 63, taken: 0, open: 0, total: 63 });
    const notices = await messagesTo('owner@example.com');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ template: 'campaign_complete', channel: 'email' });
    expect(notices[0]?.body).toContain(`/campaigns/${campaign.id}`);

    await client.post(`/api/manage/${manageToken}/claims/${claimId}/reopen`);
    expect(await status()).toBe('active');

    await client.post(`/api/manage/${manageToken}/claims/${claimId}/complete`);
    expect(await status()).toBe('completed');
    expect(await messagesTo('owner@example.com')).toHaveLength(1);
  });

  it('returns to active when a finished masechta is given back', async () => {
    const campaign = await createCampaign();
    await allButOne(campaign);
    const { manageToken } = await takeOk(visitor(), campaign, { masechtaIds: ['uktzin'] });
    const claimId = (await portion(manageToken)).submissions[0]!.claims[0]!.id;
    const client = new TestClient();
    await client.post(`/api/manage/${manageToken}/claims/${claimId}/complete`);
    await client.post(`/api/manage/${manageToken}/claims/${claimId}/release`);
    const body = await chart(campaign);
    expect(body.campaign.status).toBe('active');
    expect(body.progress.open).toBe(1);
  });
});

describe('signing back in', () => {
  it('answers matched and unmatched addresses identically, and sends nothing to a stranger', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { phone: PHONE });
    const before = await count('outbound_messages');
    const matched = await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: '718 555 0123' });
    const unmatched = await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: '718 555 0199' });
    expect(matched.status).toBe(200);
    expect(unmatched.status).toBe(matched.status);
    expect(await unmatched.text()).toBe(await matched.text());
    expect(await count('outbound_messages')).toBe(before + 1);
    expect(await messagesTo('+17185550199')).toHaveLength(0);
    expect(await lastMessage(PHONE)).toMatchObject({ template: 'participant_code', channel: 'sms' });
  });

  it('opens every submission made with one phone, and can finish and give back both', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { name: 'Moshe Katz', phone: PHONE, masechtaIds: ['peah'] });
    await takeOk(visitor(), campaign, { name: 'Moshe K.', phone: '(718) 555-0123', masechtaIds: ['demai', 'shabbos'] });
    await takeOk(visitor(), campaign, { name: 'Someone Else', phone: '718-555-0188', masechtaIds: ['yoma'] });

    const client = visitor();
    const token = await signIn(client, campaign, '718-555-0123');
    const page = await portion(token);
    expect(page.submissions.map((s) => s.name)).toEqual(['Moshe Katz', 'Moshe K.']);
    expect(page.submissions.flatMap((s) => s.claims.map((c) => c.masechtaId))).toEqual(['peah', 'demai', 'shabbos']);

    const [first, second] = page.submissions.map((s) => s.claims[0]!.id);
    expect((await client.post(`/api/manage/${token}/claims/${first}/complete`)).status).toBe(200);
    expect((await client.post(`/api/manage/${token}/claims/${second}/release`)).status).toBe(200);
    const after = await chart(campaign);
    expect(after.masechtos.find((m) => m.masechtaId === 'peah')?.status).toBe('finished');
    expect(after.masechtos.find((m) => m.masechtaId === 'demai')).toBeUndefined();
  });

  it('works with an email address', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { email: 'moshe@example.com' });
    const token = await signIn(visitor(), campaign, 'Moshe@Example.com');
    expect((await portion(token)).submissions).toHaveLength(1);
  });

  it('cannot reach a claim under a different address, or another campaign', async () => {
    const campaign = await createCampaign();
    const other = await createCampaign();
    await takeOk(visitor(), campaign, { phone: PHONE });
    const theirs = await takeOk(visitor(), campaign, { name: 'Other', phone: '718-555-0188', masechtaIds: ['demai'] });
    const elsewhere = await takeOk(visitor(), other, { phone: PHONE });
    const token = await signIn(visitor(), campaign, PHONE);

    const client = new TestClient();
    const theirClaim = (await portion(theirs.manageToken)).submissions[0]!.claims[0]!.id;
    const elsewhereClaim = (await portion(elsewhere.manageToken)).submissions[0]!.claims[0]!.id;
    expect((await client.post(`/api/manage/${token}/claims/${theirClaim}/complete`)).status).toBe(404);
    expect((await client.post(`/api/manage/${token}/claims/${elsewhereClaim}/complete`)).status).toBe(404);
    expect((await portion(token)).submissions).toHaveLength(1);
  });

  it('rejects wrong, expired and reused codes, and locks after 5 wrong tries', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { phone: PHONE });
    const request = () => visitor().post(`${base(campaign)}/sign-in/request-code`, { address: PHONE });
    const verify = (code: string) => visitor().post(`${base(campaign)}/sign-in/verify`, { address: PHONE, code });
    const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

    await request();
    let code = await lastCode(PHONE);
    const bad = await verify(wrong(code));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'invalid_code' } });
    expect((await verify(code)).status).toBe(200);
    expect((await verify(code)).status).toBe(400);

    await request();
    code = await lastCode(PHONE);
    await env.DB.prepare('UPDATE participant_login_codes SET expires_at = ?')
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    expect((await verify(code)).status).toBe(400);

    await request();
    code = await lastCode(PHONE);
    for (let i = 0; i < 5; i++) expect((await verify(wrong(code))).status).toBe(400);
    expect((await verify(code)).status).toBe(400);
  });

  it('returns 429 past 5 requests for one address in an hour', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { phone: PHONE });
    for (let i = 0; i < 5; i++) {
      expect((await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: PHONE })).status).toBe(200);
    }
    expect((await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: PHONE })).status).toBe(429);
  });

  it('returns 429 past 20 requests from one IP in an hour', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    for (let i = 0; i < 20; i++) {
      const res = await client.post(`${base(campaign)}/sign-in/request-code`, { address: `p${i}@example.com` });
      expect(res.status).toBe(200);
    }
    expect((await client.post(`${base(campaign)}/sign-in/request-code`, { address: 'x@example.com' })).status).toBe(429);
  });

  it('does not accept a code issued in another campaign', async () => {
    const one = await createCampaign();
    const two = await createCampaign();
    await takeOk(visitor(), one, { phone: PHONE });
    await takeOk(visitor(), two, { phone: PHONE });
    await visitor().post(`${base(one)}/sign-in/request-code`, { address: PHONE });
    const code = await lastCode(PHONE);
    const res = await visitor().post(`${base(two)}/sign-in/verify`, { address: PHONE, code });
    expect(res.status).toBe(400);
    expect((await visitor().post(`${base(one)}/sign-in/verify`, { address: PHONE, code })).status).toBe(200);
  });

  it('rejects a malformed address', async () => {
    const campaign = await createCampaign();
    const res = await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: 'hello' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { fields: { address: expect.any(String) } } });
  });
});

describe('editing a submission', () => {
  const edit = (token: string, participantId: string, body: Record<string, unknown>, client = visitor()) =>
    client.patch(`/api/manage/${token}/participants/${participantId}`, { name: 'Moshe Katz', isAnonymous: false, ...body });

  it('shows a new name on the chart, and hides it when anonymous is turned on', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const id = (await portion(manageToken)).submissions[0]!.participantId;

    const renamed = await edit(manageToken, id, { name: 'Moshe Yosef Katz' });
    expect(renamed.status).toBe(200);
    expect((await renamed.json<ParticipantUpdatedResponse>()).submission.name).toBe('Moshe Yosef Katz');
    expect((await chart(campaign)).masechtos[0]?.name).toBe('Moshe Yosef Katz');

    await edit(manageToken, id, { name: 'Moshe Yosef Katz', isAnonymous: true });
    expect((await chart(campaign)).masechtos[0]?.name).toBe('Anonymous');
  });

  it('rejects a blank name or an invalid phone, and changes nothing', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const id = (await portion(manageToken)).submissions[0]!.participantId;
    expect((await edit(manageToken, id, { name: '  ' })).status).toBe(400);
    const bad = await edit(manageToken, id, { phone: 'abc' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { fields: { phone: expect.any(String) } } });
    expect((await portion(manageToken)).submissions[0]).toMatchObject({ name: 'Moshe Katz', phone: null });
  });

  it('rejects editing a participant the token does not open', async () => {
    const campaign = await createCampaign();
    const mine = await takeOk(visitor(), campaign);
    const theirs = await takeOk(visitor(), campaign, { name: 'Dovid Levi', masechtaIds: ['demai'] });
    const theirId = (await portion(theirs.manageToken)).submissions[0]!.participantId;
    expect((await edit(mine.manageToken, theirId, { name: 'Hacked' })).status).toBe(404);
    expect((await portion(theirs.manageToken)).submissions[0]?.name).toBe('Dovid Levi');
  });

  it('sends one confirmation when a phone or email is added or changed, and none when nothing changed', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const id = (await portion(manageToken)).submissions[0]!.participantId;
    expect(await count('outbound_messages')).toBe(0);

    await edit(manageToken, id, { phone: PHONE });
    expect(await count('outbound_messages')).toBe(1);
    const sms = await lastMessage(PHONE);
    expect(sms).toMatchObject({ template: 'claim_confirmation', channel: 'sms' });
    expect(sms?.body).toContain(`/m/${manageToken}`);

    await edit(manageToken, id, { phone: PHONE });
    await edit(manageToken, id, { phone: PHONE, name: 'Renamed' });
    expect(await count('outbound_messages')).toBe(1);

    await edit(manageToken, id, { phone: PHONE, email: 'm@example.com' });
    expect(await count('outbound_messages')).toBe(2);
    expect(await lastMessage('m@example.com')).toMatchObject({ template: 'claim_confirmation', channel: 'email' });

    await edit(manageToken, id, { phone: '718-555-0188', email: 'm@example.com' });
    expect(await count('outbound_messages')).toBe(3);
    expect(await lastMessage('+17185550188')).toMatchObject({ template: 'claim_confirmation' });
  });

  it('lets a name-only participant add a phone and then sign in with it', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const id = (await portion(manageToken)).submissions[0]!.participantId;

    const before = await count('outbound_messages');
    await visitor().post(`${base(campaign)}/sign-in/request-code`, { address: PHONE });
    expect(await count('outbound_messages')).toBe(before);

    await edit(manageToken, id, { phone: PHONE });
    const token = await signIn(visitor(), campaign, PHONE);
    expect((await portion(token)).submissions.map((s) => s.participantId)).toEqual([id]);
  });

  it('edits one of two submissions that share a phone without touching the other', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { name: 'Father', phone: PHONE, masechtaIds: ['peah'] });
    await takeOk(visitor(), campaign, { name: 'Son', phone: PHONE, masechtaIds: ['demai'] });
    const token = await signIn(visitor(), campaign, PHONE);
    const [father, son] = (await portion(token)).submissions;

    const res = await edit(token, son!.participantId, { name: 'Son Renamed', phone: PHONE, isAnonymous: true });
    expect(res.status).toBe(200);
    expect((await res.json<ParticipantUpdatedResponse>()).manageToken).toBeUndefined();
    const after = (await portion(token)).submissions;
    expect(after.find((s) => s.participantId === father!.participantId)).toMatchObject({ name: 'Father', isAnonymous: false });
    expect(after.find((s) => s.participantId === son!.participantId)).toMatchObject({ name: 'Son Renamed', isAnonymous: true });
  });

  it('hands back a working manage token when the sign-in address is changed', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign, { phone: PHONE });
    const token = await signIn(visitor(), campaign, PHONE);
    const id = (await portion(token)).submissions[0]!.participantId;

    const res = await edit(token, id, { phone: '718-555-0188' });
    const body = await res.json<ParticipantUpdatedResponse>();
    expect(body.manageToken).toBeTruthy();
    expect((await new TestClient().get(`/api/manage/${token}`)).status).toBe(404);
    const page = await portion(body.manageToken!);
    expect(page.submissions[0]).toMatchObject({ participantId: id, phone: '+17185550188' });
  });

  it('limits edits to 10 an hour per IP', async () => {
    const campaign = await createCampaign();
    const { manageToken } = await takeOk(visitor(), campaign);
    const id = (await portion(manageToken)).submissions[0]!.participantId;
    const client = visitor();
    for (let i = 0; i < 10; i++) expect((await edit(manageToken, id, { name: `Name ${i}` }, client)).status).toBe(200);
    expect((await edit(manageToken, id, { name: 'One more' }, client)).status).toBe(429);
  });
});

describe('device memory', () => {
  const mine = async (client: TestClient, campaign: CampaignRow) => {
    const res = await client.get(`${base(campaign)}/mine`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return res.json<MineResponse>();
  };

  it('sets the cookie with the specified attributes, and a second claim adds to it', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    const first = await takeOk(client, campaign, { masechtaIds: ['peah'] });

    const header = client.setCookieHeaders.find((h) => h.startsWith('portion='))!;
    expect(header).toContain(`Path=/api/public/campaigns/${campaign.slug}`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Max-Age=31536000/);

    const second = await takeOk(client, campaign, { name: 'My son', masechtaIds: ['demai', 'shabbos'] });
    const body = await mine(client, campaign);
    expect(body.submissions).toHaveLength(2);
    expect(body.submissions.map((s) => s.manageToken).sort()).toEqual([first.manageToken, second.manageToken].sort());
    expect(body.submissions.find((s) => s.manageToken === second.manageToken)?.masechtos).toEqual([
      { masechtaId: 'demai', status: 'taken' },
      { masechtaId: 'shabbos', status: 'taken' },
    ]);
  });

  it('is empty without a cookie', async () => {
    const campaign = await createCampaign();
    await takeOk(visitor(), campaign);
    expect(await mine(visitor(), campaign)).toEqual({ submissions: [] });
  });

  it('ignores a tampered token and one from another campaign, and keeps each campaign separate', async () => {
    const campaign = await createCampaign();
    const other = await createCampaign();
    const elsewhere = await takeOk(visitor(), other);
    const client = visitor();
    const real = await takeOk(client, campaign);

    client.setCookie(
      'portion',
      [tamper(real.manageToken), elsewhere.manageToken, 'garbage', real.manageToken].join(','),
      `/api/public/campaigns/${campaign.slug}`,
    );
    const body = await mine(client, campaign);
    expect(body.submissions.map((s) => s.manageToken)).toEqual([real.manageToken]);
    // The cookie's path keeps it from being sent to another campaign at all.
    expect(await mine(client, other)).toEqual({ submissions: [] });
  });

  it('leaves out released claims and contains no phone or email', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    const created = await takeOk(client, campaign, {
      phone: PHONE,
      email: 'moshe@example.com',
      masechtaIds: ['peah', 'demai'],
    });
    const page = await portion(created.manageToken);
    await client.post(`/api/manage/${created.manageToken}/claims/${page.submissions[0]!.claims[0]!.id}/release`);
    await client.post(`/api/manage/${created.manageToken}/claims/${page.submissions[0]!.claims[1]!.id}/complete`);

    const res = await client.get(`${base(campaign)}/mine`);
    const text = await res.text();
    expect(JSON.parse(text).submissions[0].masechtos).toEqual([{ masechtaId: 'demai', status: 'finished' }]);
    expect(text).not.toContain('5550123');
    expect(text).not.toContain('@');
    expect(text).not.toContain('Moshe');
  });

  it('drops a submission once everything in it is released', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    const created = await takeOk(client, campaign);
    const claimId = (await portion(created.manageToken)).submissions[0]!.claims[0]!.id;
    await client.post(`/api/manage/${created.manageToken}/claims/${claimId}/release`);
    expect(await mine(client, campaign)).toEqual({ submissions: [] });
  });

  it('remembers a sign-in, without listing a submission twice', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    const created = await takeOk(client, campaign, { phone: PHONE });
    await takeOk(visitor(), campaign, { name: 'From another phone', phone: PHONE, masechtaIds: ['demai'] });
    await signIn(client, campaign, PHONE);
    const body = await mine(client, campaign);
    expect(body.submissions).toHaveLength(2);
    expect(body.submissions.filter((s) => s.manageToken === created.manageToken)).toHaveLength(1);
  });

  it('forgets this phone on DELETE', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    await takeOk(client, campaign);
    expect((await mine(client, campaign)).submissions).toHaveLength(1);
    expect((await client.delete(`${base(campaign)}/mine`)).status).toBe(200);
    expect(client.cookie('portion')).toBeUndefined();
    expect(await mine(client, campaign)).toEqual({ submissions: [] });
  });

  it('keeps only the 10 newest tokens', async () => {
    const campaign = await createCampaign();
    const client = visitor();
    const tokens: string[] = [];
    for (let i = 0; i < 12; i++) {
      tokens.push(await signSignInToken(tokenSecret(env), { campaignId: campaign.id, channel: 'email', address: `p${i}@example.com` }));
    }
    client.setCookie('portion', tokens.join(','), `/api/public/campaigns/${campaign.slug}`);
    await takeOk(client, campaign);
    expect(decodeURIComponent(client.cookie('portion')!).split(',')).toHaveLength(10);
  });
});

describe('setup helpers', () => {
  it('seeds a claim directly', async () => {
    const campaign = await createCampaign();
    const p = await createParticipant({ campaign_id: campaign.id });
    await createClaim({ campaign_id: campaign.id, participant_id: p.id, masechta_id: 'peah' });
    expect((await chart(campaign)).masechtos).toHaveLength(1);
  });
});

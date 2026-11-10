import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ContactDto, ContactRowResult, InvitationsResult } from '../../shared/api-types';
import { parseContactText } from '../../shared/contacts';
import { TestClient, lastMessage, loginAs, messagesTo } from '../test-http';
import { createCampaign, createClaim, createParticipant } from '../test-utils';

const OWNER = 'owner@example.com';

async function setup(overrides: { status?: 'draft' | 'active' } = {}) {
  const owner = await loginAs(OWNER);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(OWNER).first<{ id: string }>();
  const campaign = await createCampaign({ owner_user_id: user!.id, ...overrides });
  return { owner, campaign, base: `/api/campaigns/${campaign.id}` };
}

const add = async (client: TestClient, base: string, text: string) =>
  (await (await client.post(`${base}/contacts`, { rows: parseContactText(text) })).json<{ results: ContactRowResult[] }>())
    .results;

const contacts = async (client: TestClient, base: string) =>
  (await (await client.get(`${base}/contacts`)).json<{ contacts: ContactDto[] }>()).contacts;

const invite = (client: TestClient, base: string, body: Record<string, unknown> = { confirmedExpectation: true }) =>
  client.post(`${base}/invitations`, body);

const invitationCount = async () =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM outbound_messages WHERE template = 'invitation'`).first<{ n: number }>())?.n;

describe('contacts', () => {
  it('reports each pasted line, and keeps the valid ones', async () => {
    const { owner, base } = await setup();
    const results = await add(
      owner,
      base,
      [
        'Moshe Katz, (718) 555-0123, moshe@example.com',
        'Bad Phone, 12-34',
        'Dovid Levi, dovid@example.com',
        'Moshe Again, 718 555 0123',
        'Bad Phone Two, 999-999-99999',
        'No Details',
        'dovid@example.com',
        'Same Email, DOVID@example.com',
      ].join('\n'),
    );
    expect(results.map((r) => r.status)).toEqual([
      'added', 'invalid', 'added', 'duplicate', 'invalid', 'invalid', 'invalid', 'duplicate',
    ]);
    expect(results[1]?.reason).toBe('No phone number or email.');
    expect(results[4]?.reason).toBe('The phone number is not valid.');
    expect(results[5]?.reason).toBe('No phone number or email.');
    expect(results[6]?.reason).toBe('No name.');

    expect(await contacts(owner, base)).toMatchObject([
      { name: 'Moshe Katz', phone: '+17185550123', email: 'moshe@example.com', invitedAt: null, hasTaken: false },
      { name: 'Dovid Levi', phone: null, email: 'dovid@example.com' },
    ]);
  });

  it('shows who has taken a masechta, and deletes a contact', async () => {
    const { owner, campaign, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123\nDovid Levi, dovid@example.com');
    const person = await createParticipant({ campaign_id: campaign.id, phone: '+17185550123' });
    await createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id: 'peah' });

    const list = await contacts(owner, base);
    expect(list.map((c) => c.hasTaken)).toEqual([true, false]);

    expect((await owner.delete(`${base}/contacts/${list[1]!.id}`)).status).toBe(200);
    expect((await owner.delete(`${base}/contacts/${list[1]!.id}`)).status).toBe(404);
    expect(await contacts(owner, base)).toHaveLength(1);
  });

  it('is closed to other users', async () => {
    const { owner, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123');
    const id = (await contacts(owner, base))[0]!.id;
    const stranger = await loginAs('stranger@example.com');
    expect((await stranger.get(`${base}/contacts`)).status).toBe(404);
    expect((await stranger.post(`${base}/contacts`, { rows: [{ name: 'X', email: 'x@example.com' }] })).status).toBe(404);
    expect((await stranger.delete(`${base}/contacts/${id}`)).status).toBe(404);
    expect((await invite(stranger, base)).status).toBe(404);
    expect(await invitationCount()).toBe(0);
  });
});

describe('invitations', () => {
  it('requires the confirmation', async () => {
    const { owner, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123');
    expect((await invite(owner, base, {})).status).toBe(400);
    expect((await invite(owner, base, { confirmedExpectation: false })).status).toBe(400);
    expect(await invitationCount()).toBe(0);
  });

  it('requires an active campaign', async () => {
    const { owner, base } = await setup({ status: 'draft' });
    await add(owner, base, 'Moshe Katz, 718-555-0123');
    expect((await invite(owner, base)).status).toBe(409);
    expect(await invitationCount()).toBe(0);
  });

  it('sends by text when there is a phone, by email otherwise, and never twice', async () => {
    const { owner, campaign, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123, moshe@example.com\nDovid Levi, dovid@example.com');

    const first = await (await invite(owner, base)).json<InvitationsResult>();
    expect(first).toEqual({ sent: 2, suppressed: 0, alreadyInvited: 0, failed: 0 });

    const sms = await lastMessage('+17185550123');
    expect(sms).toMatchObject({ channel: 'sms', template: 'invitation' });
    expect(sms?.body).toContain(`/c/${campaign.slug}`);
    expect(sms?.body).toContain('Reply STOP to opt out');
    expect(await messagesTo('moshe@example.com')).toHaveLength(0);
    const email = await lastMessage('dovid@example.com');
    expect(email).toMatchObject({ channel: 'email', template: 'invitation' });
    expect(email?.body).toContain('/unsubscribe/');

    const list = await contacts(owner, base);
    expect(list.every((c) => c.invitedAt !== null)).toBe(true);

    // Again for everyone, and again naming them: nobody is messaged twice.
    expect(await (await invite(owner, base)).json<InvitationsResult>()).toMatchObject({ sent: 0 });
    const again = await invite(owner, base, { confirmedExpectation: true, contactIds: list.map((c) => c.id) });
    expect(await again.json<InvitationsResult>()).toEqual({ sent: 0, suppressed: 0, alreadyInvited: 2, failed: 0 });
    expect(await invitationCount()).toBe(2);
  });

  it('invites only the selection when one is given', async () => {
    const { owner, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123\nDovid Levi, dovid@example.com');
    const list = await contacts(owner, base);
    const res = await invite(owner, base, { confirmedExpectation: true, contactIds: [list[1]!.id] });
    expect(await res.json<InvitationsResult>()).toMatchObject({ sent: 1 });
    const after = await contacts(owner, base);
    expect(after.map((c) => c.invitedAt !== null)).toEqual([false, true]);
  });

  it('records opted-out contacts as suppressed', async () => {
    const { owner, base } = await setup();
    await add(owner, base, 'Moshe Katz, 718-555-0123\nDovid Levi, dovid@example.com');
    await env.DB.prepare(`INSERT INTO opt_outs (channel, address, created_at) VALUES ('sms', '+17185550123', 'x')`).run();

    const result = await (await invite(owner, base)).json<InvitationsResult>();
    expect(result).toEqual({ sent: 1, suppressed: 1, alreadyInvited: 0, failed: 0 });
    expect(await lastMessage('+17185550123')).toMatchObject({ status: 'suppressed', template: 'invitation' });
  });
});

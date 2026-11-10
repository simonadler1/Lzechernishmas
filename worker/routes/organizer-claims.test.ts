import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { OrganizerClaim, PublicChartResponse } from '../../shared/api-types';
import { ALL_MASECHTOS } from '../../shared/shas';
import { signManageToken, tokenSecret } from '../domain/tokens';
import { TestClient, lastMessage, loginAs, messagesTo } from '../test-http';
import { createCampaign, createClaim, createParticipant, type CampaignRow } from '../test-utils';

const OWNER = 'owner@example.com';

async function setup() {
  const owner = await loginAs(OWNER);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(OWNER).first<{ id: string }>();
  const campaign = await createCampaign({ owner_user_id: user!.id });
  return { owner, campaign, base: `/api/campaigns/${campaign.id}` };
}

const claimsOf = async (client: TestClient, base: string) =>
  (await (await client.get(`${base}/claims`)).json<{ claims: OrganizerClaim[] }>()).claims;

const chart = async (campaign: CampaignRow) =>
  (await new TestClient().get(`/api/public/campaigns/${campaign.slug}`)).json<PublicChartResponse>();

describe('organizer claims', () => {
  it('lists live claims in Shas order with real names and contact details', async () => {
    const { owner, campaign, base } = await setup();
    const anon = await createParticipant({
      campaign_id: campaign.id, name: 'Hidden Name', is_anonymous: 1, phone: '+17185550123', email: 'h@example.com',
    });
    const other = await createParticipant({ campaign_id: campaign.id, name: 'Dovid Levi' });
    await createClaim({ campaign_id: campaign.id, participant_id: other.id, masechta_id: 'uktzin' });
    await createClaim({ campaign_id: campaign.id, participant_id: anon.id, masechta_id: 'peah', status: 'completed' });
    await createClaim({ campaign_id: campaign.id, participant_id: anon.id, masechta_id: 'demai', status: 'released' });

    const claims = await claimsOf(owner, base);
    expect(claims.map((c) => c.masechtaId)).toEqual(['peah', 'uktzin']);
    expect(claims[0]).toMatchObject({
      status: 'finished',
      participant: { name: 'Hidden Name', isAnonymous: true, phone: '+17185550123', email: 'h@example.com' },
    });
    expect(claims[1]).toMatchObject({ status: 'taken', participant: { name: 'Dovid Levi', phone: null } });
  });

  it('assigns masechtos without contact details, past the public limit of 10', async () => {
    const { owner, campaign, base } = await setup();
    const ids = ALL_MASECHTOS.slice(0, 14).map((m) => m.id);
    const res = await owner.post(`${base}/claims`, { name: 'Zeidy Cohen', masechtaIds: ids });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ notified: false });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM outbound_messages WHERE template = ?').bind('claim_confirmation').first()).toEqual({ n: 0 });

    const claims = await claimsOf(owner, base);
    expect(claims).toHaveLength(14);
    expect(claims[0]?.participant).toMatchObject({ name: 'Zeidy Cohen', source: 'organizer' });
    expect((await chart(campaign)).progress.taken).toBe(14);
  });

  it('sends the link when contact details are given', async () => {
    const { owner, base } = await setup();
    const res = await owner.post(`${base}/claims`, { name: 'Moshe', phone: '718-555-0123', masechtaIds: ['peah'] });
    const { participantId } = await res.json<{ participantId: string }>();
    const message = await lastMessage('+17185550123');
    expect(message).toMatchObject({ template: 'claim_confirmation', channel: 'sms' });
    expect(message?.body).toContain(`/m/${await signManageToken(tokenSecret(env), participantId)}`);
  });

  it('returns 409 with the conflicts and creates nothing', async () => {
    const { owner, campaign, base } = await setup();
    const holder = await createParticipant({ campaign_id: campaign.id });
    await createClaim({ campaign_id: campaign.id, participant_id: holder.id, masechta_id: 'peah' });
    const res = await owner.post(`${base}/claims`, { name: 'Late', masechtaIds: ['berachos', 'peah'] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'conflict', conflicts: ['peah'] } });
    expect(await claimsOf(owner, base)).toHaveLength(1);
  });

  it('marks finished, undoes it and releases', async () => {
    const { owner, campaign, base } = await setup();
    const holder = await createParticipant({ campaign_id: campaign.id });
    const claim = await createClaim({ campaign_id: campaign.id, participant_id: holder.id, masechta_id: 'peah' });

    expect((await owner.patch(`${base}/claims/${claim.id}`, { status: 'completed' })).status).toBe(200);
    expect((await claimsOf(owner, base))[0]?.status).toBe('finished');
    expect((await owner.patch(`${base}/claims/${claim.id}`, { status: 'claimed' })).status).toBe(200);
    expect((await claimsOf(owner, base))[0]?.status).toBe('taken');
    expect((await owner.patch(`${base}/claims/${claim.id}`, { status: 'released' })).status).toBe(200);
    expect(await claimsOf(owner, base)).toEqual([]);
    expect((await owner.patch(`${base}/claims/${claim.id}`, { status: 'completed' })).status).toBe(404);
    expect((await owner.patch(`${base}/claims/${claim.id}`, { status: 'nonsense' })).status).toBe(400);
  });

  it('completes the campaign when the final masechta is marked finished here', async () => {
    const { owner, campaign, base } = await setup();
    const helper = await createParticipant({ campaign_id: campaign.id });
    await env.DB.batch(
      ALL_MASECHTOS.slice(0, 62).map((m) =>
        env.DB.prepare(
          `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at, completed_at)
           VALUES (?, ?, ?, ?, 'completed', 'x', 'x')`,
        ).bind(crypto.randomUUID(), campaign.id, helper.id, m.id),
      ),
    );
    const last = await createClaim({ campaign_id: campaign.id, participant_id: helper.id, masechta_id: 'uktzin' });
    await owner.patch(`${base}/claims/${last.id}`, { status: 'completed' });

    const body = await (await owner.get(base)).json<{ campaign: { status: string } }>();
    expect(body.campaign.status).toBe('completed');
    expect(await messagesTo(OWNER)).toContainEqual(expect.objectContaining({ template: 'campaign_complete' }));
  });

  it('edits a participant, and sends the link to a phone added to a name-only person', async () => {
    const { owner, campaign, base } = await setup();
    const person = await createParticipant({ campaign_id: campaign.id, name: 'No Contact' });
    await createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id: 'peah' });

    const res = await owner.patch(`${base}/participants/${person.id}`, {
      name: 'Has Contact', phone: '(718) 555-0123', isAnonymous: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ submission: { name: 'Has Contact', phone: '+17185550123', isAnonymous: true } });

    const message = await lastMessage('+17185550123');
    expect(message).toMatchObject({ template: 'claim_confirmation' });
    expect(message?.body).toContain(`/m/${await signManageToken(tokenSecret(env), person.id)}`);
    expect(message?.body).toContain('Peah');
    expect((await chart(campaign)).masechtos[0]?.name).toBe('Anonymous');

    const bad = await owner.patch(`${base}/participants/${person.id}`, { name: '', isAnonymous: false });
    expect(bad.status).toBe(400);
  });

  it('answers 404 to non-owners on every route, and for a participant or claim of another campaign', async () => {
    const { owner, campaign, base } = await setup();
    const person = await createParticipant({ campaign_id: campaign.id });
    const claim = await createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id: 'peah' });

    const stranger = await loginAs('stranger@example.com');
    expect((await stranger.get(`${base}/claims`)).status).toBe(404);
    expect((await stranger.post(`${base}/claims`, { name: 'X', masechtaIds: ['demai'] })).status).toBe(404);
    expect((await stranger.patch(`${base}/claims/${claim.id}`, { status: 'released' })).status).toBe(404);
    expect((await stranger.patch(`${base}/participants/${person.id}`, { name: 'X', isAnonymous: false })).status).toBe(404);
    expect((await new TestClient().get(`${base}/claims`)).status).toBe(401);

    // The owner cannot reach into a campaign that is not theirs through their own.
    const foreign = await createCampaign();
    const foreignPerson = await createParticipant({ campaign_id: foreign.id, name: 'Foreign' });
    const foreignClaim = await createClaim({ campaign_id: foreign.id, participant_id: foreignPerson.id, masechta_id: 'peah' });
    expect((await owner.patch(`${base}/participants/${foreignPerson.id}`, { name: 'X', isAnonymous: false })).status).toBe(404);
    expect((await owner.patch(`${base}/claims/${foreignClaim.id}`, { status: 'released' })).status).toBe(404);

    expect(await claimsOf(owner, base)).toHaveLength(1);
    const untouched = await env.DB.prepare('SELECT name FROM participants WHERE id = ?').bind(foreignPerson.id).first<{ name: string }>();
    expect(untouched?.name).toBe('Foreign');
  });
});

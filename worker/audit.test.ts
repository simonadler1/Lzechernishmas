import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from './app';
import { campaignRoutes } from './routes/campaigns';
import { devRoutes } from './routes/dev';
import { TestClient, loginAs } from './test-http';
import { createCampaign, createClaim, createParticipant } from './test-utils';

/**
 * Launch-readiness checks that walk the route tables, so a route added later
 * is covered without anyone remembering to add a test for it.
 */

const routesOf = (router: { routes: { method: string; path: string }[] }) => {
  const seen = new Set<string>();
  return router.routes
    .filter((route) => route.method !== 'ALL')
    .filter((route) => !seen.has(`${route.method} ${route.path}`) && seen.add(`${route.method} ${route.path}`));
};

describe('audit: /api/campaigns/* is closed to everyone but the owner', () => {
  const scoped = routesOf(campaignRoutes).filter((route) => route.path.includes(':id'));

  it('covers every campaign route', () => {
    expect(scoped.map((r) => `${r.method} ${r.path}`).sort()).toEqual(
      [
        'GET /:id', 'PATCH /:id', 'POST /:id/activate', 'POST /:id/archive',
        'GET /:id/claims', 'POST /:id/claims', 'PATCH /:id/claims/:claimId', 'PATCH /:id/participants/:participantId',
        'GET /:id/contacts', 'POST /:id/contacts', 'DELETE /:id/contacts/:contactId', 'POST /:id/invitations',
      ].sort(),
    );
  });

  it('answers 404 to another organizer and 401 to a visitor, on every one of them', async () => {
    const campaign = await createCampaign();
    const person = await createParticipant({ campaign_id: campaign.id });
    const claim = await createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id: 'peah' });
    await env.DB.prepare(`INSERT INTO contacts (id, campaign_id, name, email, created_at) VALUES ('contact-1', ?, 'C', 'c@example.com', 'x')`)
      .bind(campaign.id)
      .run();
    const stranger = await loginAs('stranger@example.com');
    const visitor = new TestClient();

    for (const route of scoped) {
      const path =
        '/api/campaigns' +
        route.path
          .replace(':id', campaign.id)
          .replace(':claimId', claim.id)
          .replace(':participantId', person.id)
          .replace(':contactId', 'contact-1');
      // A body that would be accepted from the owner, so only ownership can be the reason for refusal.
      const body =
        route.method === 'GET' || route.method === 'DELETE'
          ? undefined
          : { name: 'X', isAnonymous: false, masechtaIds: ['demai'], status: 'released', honoreeName: 'X', confirmedExpectation: true, rows: [{ name: 'X', email: 'x@example.com' }] };
      expect((await stranger.request(route.method, path, body)).status, `${route.method} ${path} as a stranger`).toBe(404);
      expect((await visitor.request(route.method, path, body)).status, `${route.method} ${path} signed out`).toBe(401);
    }

    // Nothing changed.
    const after = await env.DB.prepare('SELECT status FROM claims WHERE id = ?').bind(claim.id).first<{ status: string }>();
    expect(after?.status).toBe('claimed');
    const contacts = await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts').first<{ n: number }>();
    expect(contacts?.n).toBe(1);
    const state = await env.DB.prepare('SELECT status, honoree_name FROM campaigns WHERE id = ?').bind(campaign.id).first();
    expect(state).toMatchObject({ status: 'active', honoree_name: 'נפתלי בן יעקב' });
  });
});

describe('audit: /api/dev/* does not exist in production', () => {
  it('answers 404 on every dev route', async () => {
    const routes = routesOf(devRoutes);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(['GET /outbox', 'POST /run-reminders', 'POST /seed']);
    for (const route of routes) {
      const res = await app.request(`/api/dev${route.path}`, { method: route.method }, { ...env, ENVIRONMENT: 'production' });
      expect(res.status, `${route.method} /api/dev${route.path}`).toBe(404);
    }
    // And any other path under /api/dev.
    expect((await app.request('/api/dev/anything', {}, { ...env, ENVIRONMENT: 'production' })).status).toBe(404);
  });

  it('keeps seeding off in preview while the outbox stays on', async () => {
    const preview = { ...env, ENVIRONMENT: 'preview' };
    expect((await app.request('/api/dev/seed', { method: 'POST' }, preview)).status).toBe(404);
    expect((await app.request('/api/dev/outbox', {}, preview)).status).toBe(200);
  });
});

describe('audit: no phone or email in what visitors can load', () => {
  it('keeps contact details out of the chart and device-memory responses', async () => {
    const campaign = await createCampaign();
    const client = new TestClient();
    const taken = await client.post(`/api/public/campaigns/${campaign.slug}/claims`, {
      name: 'Private Person',
      phone: '718-555-0123',
      email: 'private@example.com',
      isAnonymous: true,
      masechtaIds: ['peah'],
    });
    expect(taken.status).toBe(201);
    for (const path of [`/api/public/campaigns/${campaign.slug}`, `/api/public/campaigns/${campaign.slug}/mine`]) {
      const text = await (await client.get(path)).text();
      expect(text, path).not.toMatch(/5550123|private@example\.com|Private Person/);
    }
    // The claim response itself carries only the link and the masechtos.
    expect(await taken.text()).not.toMatch(/5550123|private@example\.com/);
  });
});

describe('audit: a missing TOKEN_SECRET is reported on every request', () => {
  it('answers 500 with a clear message instead of working partly', async () => {
    const broken = { ...env, TOKEN_SECRET: undefined };
    for (const path of ['/api/health', '/api/public/campaigns/anything', '/api/auth/me']) {
      const res = await app.request(path, {}, broken);
      expect(res.status, path).toBe(500);
      expect(await res.json()).toMatchObject({ error: { code: 'misconfigured' } });
    }
  });
});

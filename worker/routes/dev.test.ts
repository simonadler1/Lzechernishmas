import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createCampaign } from '../test-utils';

const seedAs = (environment: string, scenario = 'empty') =>
  app.request(`/api/dev/seed?scenario=${scenario}`, { method: 'POST' }, { ...env, ENVIRONMENT: environment });

describe('POST /api/dev/seed', () => {
  it('resets the database in development', async () => {
    await createCampaign();
    const res = await seedAs('development');
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM campaigns').first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('is 404 in preview and production, and leaves data alone', async () => {
    await createCampaign();
    expect((await seedAs('preview')).status).toBe(404);
    expect((await seedAs('production')).status).toBe(404);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM campaigns').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('rejects an unknown scenario', async () => {
    expect((await seedAs('development', 'nope')).status).toBe(400);
  });
});

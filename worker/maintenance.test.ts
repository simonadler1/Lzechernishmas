import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from './app';
import { runScheduled } from './scheduled';

const paused = { ...env, MAINTENANCE_MODE: 'on' };

describe('MAINTENANCE_MODE', () => {
  it('refuses writes with 503 and the paused message', async () => {
    const res = await app.request(
      '/api/auth/request-code',
      { method: 'POST', body: JSON.stringify({ email: 'a@example.com' }), headers: { 'content-type': 'application/json' } },
      paused,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: 'maintenance', message: 'Signups are paused for a short while. Please try again soon.' },
    });
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_codes').first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it('still answers reads', async () => {
    expect((await app.request('/api/health', {}, paused)).status).toBe(200);
  });

  it('is off by default', async () => {
    const res = await app.request(
      '/api/auth/request-code',
      { method: 'POST', body: JSON.stringify({ email: 'a@example.com' }), headers: { 'content-type': 'application/json' } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it('makes the scheduled run do nothing', async () => {
    expect(await runScheduled(paused)).toMatchObject({ skipped: 'maintenance', sent: 0 });
  });
});

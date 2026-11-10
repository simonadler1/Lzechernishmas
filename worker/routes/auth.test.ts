import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../domain/rate-limit';
import { TestClient, lastCode, loginAs } from '../test-http';
import { createUser } from '../test-utils';

const email = 'organizer@example.com';

const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

describe('organizer login', () => {
  it('logs in with the emailed code, and creates the user once', async () => {
    const client = new TestClient();
    const request = await client.post('/api/auth/request-code', { email: ' Organizer@Example.com ' });
    expect(request.status).toBe(200);

    const verify = await client.post('/api/auth/verify', { email, code: await lastCode(email) });
    expect(verify.status).toBe(200);
    expect(await verify.json()).toMatchObject({ user: { email } });

    const cookie = client.setCookieHeaders.find((h) => h.startsWith('session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email } });

    await loginAs(email);
    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    expect(users?.n).toBe(1);
  });

  it('stores only hashes of the code and the session token', async () => {
    const client = await loginAs(email);
    const code = await env.DB.prepare('SELECT code_hash FROM login_codes').first<{ code_hash: string }>();
    expect(code?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    const session = await env.DB.prepare('SELECT token_hash FROM sessions').first<{ token_hash: string }>();
    expect(session?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.token_hash).not.toBe(client.cookie('session'));
  });

  it('rejects a wrong code', async () => {
    const client = new TestClient();
    await client.post('/api/auth/request-code', { email });
    const res = await client.post('/api/auth/verify', { email, code: wrong(await lastCode(email)) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_code' } });
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects an expired code', async () => {
    const client = new TestClient();
    await client.post('/api/auth/request-code', { email });
    await env.DB.prepare('UPDATE login_codes SET expires_at = ?')
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    const res = await client.post('/api/auth/verify', { email, code: await lastCode(email) });
    expect(res.status).toBe(400);
  });

  it('rejects a reused code', async () => {
    const client = new TestClient();
    await client.post('/api/auth/request-code', { email });
    const code = await lastCode(email);
    expect((await client.post('/api/auth/verify', { email, code })).status).toBe(200);
    expect((await new TestClient().post('/api/auth/verify', { email, code })).status).toBe(400);
  });

  it('locks a code after 5 wrong attempts', async () => {
    const client = new TestClient();
    await client.post('/api/auth/request-code', { email });
    const code = await lastCode(email);
    for (let i = 0; i < 5; i++) {
      expect((await client.post('/api/auth/verify', { email, code: wrong(code) })).status).toBe(400);
    }
    expect((await client.post('/api/auth/verify', { email, code })).status).toBe(400);
  });

  it('rejects a code issued to a different email', async () => {
    const client = new TestClient();
    await client.post('/api/auth/request-code', { email });
    await client.post('/api/auth/request-code', { email: 'other@example.com' });
    const res = await client.post('/api/auth/verify', { email: 'other@example.com', code: await lastCode(email) });
    // The two codes could match by chance once in a million runs.
    if ((await lastCode(email)) !== (await lastCode('other@example.com'))) expect(res.status).toBe(400);
  });

  it('returns 429 past 5 requests per email per hour', async () => {
    const client = new TestClient();
    for (let i = 0; i < 5; i++) {
      expect((await client.post('/api/auth/request-code', { email })).status).toBe(200);
    }
    const res = await client.post('/api/auth/request-code', { email });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect((await client.post('/api/auth/request-code', { email: 'someone-else@example.com' })).status).toBe(200);
  });

  it('returns 429 past 20 requests per IP per hour', async () => {
    const client = new TestClient({ 'cf-connecting-ip': '203.0.113.9' });
    for (let i = 0; i < 20; i++) {
      expect((await client.post('/api/auth/request-code', { email: `person${i}@example.com` })).status).toBe(200);
    }
    expect((await client.post('/api/auth/request-code', { email: 'one-more@example.com' })).status).toBe(429);
    const elsewhere = new TestClient({ 'cf-connecting-ip': '203.0.113.10' });
    expect((await elsewhere.post('/api/auth/request-code', { email: 'one-more@example.com' })).status).toBe(200);
  });

  it('answers known and unknown emails identically', async () => {
    await createUser({ email: 'known@example.com' });
    const known = await new TestClient().post('/api/auth/request-code', { email: 'known@example.com' });
    const unknown = await new TestClient().post('/api/auth/request-code', { email: 'unknown@example.com' });
    expect(known.status).toBe(unknown.status);
    expect(await known.text()).toBe(await unknown.text());
  });

  it('rejects a malformed email', async () => {
    const res = await new TestClient().post('/api/auth/request-code', { email: 'nope' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation', fields: { email: expect.any(String) } } });
  });

  it('is 401 on /me without a session and after logout', async () => {
    expect((await new TestClient().get('/api/auth/me')).status).toBe(401);
    const client = await loginAs(email);
    const token = client.cookie('session')!;
    expect((await client.get('/api/auth/me')).status).toBe(200);
    expect((await client.post('/api/auth/logout')).status).toBe(200);
    expect((await client.get('/api/auth/me')).status).toBe(401);

    // The old token is dead on the server, not only removed from the browser.
    const replay = new TestClient();
    replay.setCookie('session', token);
    expect((await replay.get('/api/auth/me')).status).toBe(401);
  });

  it('ignores an expired session', async () => {
    const client = await loginAs(email);
    await env.DB.prepare('UPDATE sessions SET expires_at = ?')
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });
});

describe('checkRateLimit', () => {
  it('counts within a window and starts over after it', async () => {
    const start = new Date('2030-01-01T10:00:00Z');
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(env, 'k', 3, 60, start)).toBe(true);
    expect(await checkRateLimit(env, 'k', 3, 60, new Date('2030-01-01T10:00:30Z'))).toBe(false);
    expect(await checkRateLimit(env, 'k', 3, 60, new Date('2030-01-01T10:01:00Z'))).toBe(true);
    expect(await checkRateLimit(env, 'other', 3, 60, start)).toBe(true);
  });
});

import { env, exports } from 'cloudflare:workers';

/**
 * A tiny browser stand-in for route tests: it keeps cookies between requests,
 * honouring each cookie's Path, and talks to the Worker over https so Secure
 * cookies behave as they do when deployed.
 */
export class TestClient {
  private cookies = new Map<string, { value: string; path: string }>();
  readonly setCookieHeaders: string[] = [];

  constructor(private readonly headers: Record<string, string> = {}) {}

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const cookie = [...this.cookies.entries()]
      .filter(([, c]) => path.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ');
    const res = await exports.default.fetch(`https://app.test${path}`, {
      method,
      headers: {
        ...this.headers,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const header of res.headers.getSetCookie()) {
      this.setCookieHeaders.push(header);
      const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const pathAttribute = attributes.find((a) => a.toLowerCase().startsWith('path='));
      const maxAge = attributes.find((a) => a.toLowerCase().startsWith('max-age='));
      if (value === '' || maxAge?.split('=')[1] === '0') this.cookies.delete(name);
      else this.cookies.set(name, { value, path: pathAttribute?.slice(5) ?? '/' });
    }
    return res;
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, body?: unknown) => this.request('POST', path, body ?? {});
  patch = (path: string, body: unknown) => this.request('PATCH', path, body);
  delete = (path: string) => this.request('DELETE', path);

  cookie(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }

  setCookie(name: string, value: string, path = '/') {
    this.cookies.set(name, { value, path });
  }
}

/** The newest message sent to an address, as a test's stand-in for reading a phone or inbox. */
export async function lastMessage(to: string, template?: string) {
  const row = await env.DB.prepare(
    `SELECT * FROM outbound_messages WHERE to_address = ?1 AND (?2 IS NULL OR template = ?2)
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  )
    .bind(to, template ?? null)
    .first<{ body: string; subject: string | null; template: string; status: string; channel: string }>();
  return row;
}

export async function lastCode(to: string): Promise<string> {
  const message = await lastMessage(to);
  const code = message?.body.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code was sent to ${to}`);
  return code;
}

export async function messagesTo(to: string) {
  const { results } = await env.DB.prepare('SELECT * FROM outbound_messages WHERE to_address = ? ORDER BY created_at')
    .bind(to)
    .all<{ body: string; template: string; status: string; channel: string }>();
  return results;
}

/** Logs an organizer in through the real routes and returns their client. */
export async function loginAs(email: string): Promise<TestClient> {
  const client = new TestClient();
  await client.post('/api/auth/request-code', { email });
  const res = await client.post('/api/auth/verify', { email, code: await lastCode(email) });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  return client;
}

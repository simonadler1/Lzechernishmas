import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../lib/http';
import { randomToken, sha256Hex } from './tokens';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

/**
 * Cookies are always Secure, except on a plain-http development server, where
 * a phone on the same network could not otherwise log in.
 */
export function cookieSecure(c: Context<AppEnv>): boolean {
  return !(c.env.ENVIRONMENT === 'development' && new URL(c.req.url).protocol === 'http:');
}

export async function createSession(c: Context<AppEnv>, userId: string, now = new Date()): Promise<void> {
  const token = randomToken();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, expires.toISOString(), now.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export async function currentUser(c: Context<AppEnv>, now = new Date()): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT users.id, users.email, users.name FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256Hex(token), now.toISOString())
    .first<SessionUser>();
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: cookieSecure(c) });
}

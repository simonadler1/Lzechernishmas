import type { Channel } from '../messaging/types';
import { sha256Hex, tokenSecret } from './tokens';

/**
 * Six-digit codes, shared by organizer login and participant sign-in.
 * A code lasts 10 minutes, works once, and locks after 5 wrong tries.
 * Only the newest code for an address counts.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export type CodeScope =
  | { kind: 'organizer'; email: string }
  | { kind: 'participant'; campaignId: string; channel: Channel; address: string };

const scopeKey = (scope: CodeScope) =>
  scope.kind === 'organizer'
    ? `organizer:${scope.email}`
    : `participant:${scope.campaignId}:${scope.channel}:${scope.address}`;

export function generateCode(): string {
  const buffer = new Uint32Array(1);
  // Reject the top sliver of the range so every code is equally likely.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buffer);
  while (buffer[0]! >= limit);
  return String(buffer[0]! % 1_000_000).padStart(6, '0');
}

// Salted with the secret and the scope, so a copied table cannot be reversed
// with a list of the million possible codes.
const hashCode = (env: Pick<Env, 'TOKEN_SECRET'>, scope: CodeScope, code: string) =>
  sha256Hex(`${tokenSecret(env)}:${scopeKey(scope)}:${code}`);

export async function issueCode(
  env: Pick<Env, 'DB' | 'TOKEN_SECRET'>,
  scope: CodeScope,
  now: Date = new Date(),
): Promise<string> {
  const code = generateCode();
  const id = crypto.randomUUID();
  const hash = await hashCode(env, scope, code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  if (scope.kind === 'organizer') {
    await env.DB.prepare(
      'INSERT INTO login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, scope.email, hash, expiresAt, now.toISOString())
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO participant_login_codes (id, campaign_id, channel, address, code_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, scope.campaignId, scope.channel, scope.address, hash, expiresAt, now.toISOString())
      .run();
  }
  return code;
}

interface CodeRow {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
}

/** True exactly once for the right code. Every wrong try counts toward the lock. */
export async function verifyCode(
  env: Pick<Env, 'DB' | 'TOKEN_SECRET'>,
  scope: CodeScope,
  code: string,
  now: Date = new Date(),
): Promise<boolean> {
  const table = scope.kind === 'organizer' ? 'login_codes' : 'participant_login_codes';
  const latest =
    scope.kind === 'organizer'
      ? env.DB.prepare(
          `SELECT id, code_hash, attempts, expires_at, consumed_at FROM login_codes
           WHERE email = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        ).bind(scope.email)
      : env.DB.prepare(
          `SELECT id, code_hash, attempts, expires_at, consumed_at FROM participant_login_codes
           WHERE campaign_id = ? AND channel = ? AND address = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        ).bind(scope.campaignId, scope.channel, scope.address);

  const row = await latest.first<CodeRow>();
  if (!row || row.consumed_at || row.expires_at <= now.toISOString() || row.attempts >= MAX_ATTEMPTS) return false;

  if ((await hashCode(env, scope, code)) !== row.code_hash) {
    await env.DB.prepare(`UPDATE ${table} SET attempts = attempts + 1 WHERE id = ?`).bind(row.id).run();
    return false;
  }

  // The WHERE clause makes two simultaneous correct tries produce one winner.
  const consumed = await env.DB.prepare(
    `UPDATE ${table} SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND attempts < ?`,
  )
    .bind(now.toISOString(), row.id, MAX_ATTEMPTS)
    .run();
  return consumed.meta.changes === 1;
}

export const INVALID_CODE_MESSAGE = 'That code is not right, or it has expired. You can ask for a new one.';

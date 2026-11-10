import type { Channel } from '../messaging/types';

/**
 * Signed links. Nothing here is stored: each token carries its subject plus an
 * HMAC-SHA256 signature, so reminders can rebuild the same link later.
 *
 *   manage       <participantId>.<sig over "manage:<participantId>">
 *   unsubscribe  <b64url("<channel>:<address>")>.<sig over "unsub:<channel>:<address>">
 *   sign-in      <b64url("<campaignId>:<channel>:<address>")>.<sig over "portion:<campaignId>:<channel>:<address>">
 */

const encoder = new TextEncoder();

export function tokenSecret(env: Pick<Env, 'TOKEN_SECRET'>): string {
  const secret = env.TOKEN_SECRET;
  if (!secret) throw new Error('TOKEN_SECRET is not set. Add it to .dev.vars or with `wrangler secret put`.');
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

const encodeText = (text: string) => toBase64Url(encoder.encode(text));

function decodeText(text: string): string | null {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sign(secret: string, payload: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

/** `crypto.subtle.verify` compares in constant time. */
async function verify(secret: string, payload: string, signature: string): Promise<boolean> {
  const bytes = fromBase64Url(signature);
  if (!bytes || bytes.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, encoder.encode(payload));
}

function split(token: string): [string, string] | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  return [token.slice(0, dot), token.slice(dot + 1)];
}

// Manage tokens

export async function signManageToken(secret: string, participantId: string): Promise<string> {
  return `${participantId}.${await sign(secret, `manage:${participantId}`)}`;
}

export async function verifyManageToken(secret: string, token: string): Promise<string | null> {
  const parts = split(token);
  if (!parts) return null;
  const [participantId, signature] = parts;
  return (await verify(secret, `manage:${participantId}`, signature)) ? participantId : null;
}

// Unsubscribe tokens

export interface AddressRef {
  channel: Channel;
  address: string;
}

function parseChannel(value: string): Channel | null {
  return value === 'sms' || value === 'email' ? value : null;
}

export async function signUnsubscribeToken(secret: string, ref: AddressRef): Promise<string> {
  const subject = `${ref.channel}:${ref.address}`;
  return `${encodeText(subject)}.${await sign(secret, `unsub:${subject}`)}`;
}

export async function verifyUnsubscribeToken(secret: string, token: string): Promise<AddressRef | null> {
  const parts = split(token);
  if (!parts) return null;
  const subject = decodeText(parts[0]);
  if (subject === null) return null;
  const colon = subject.indexOf(':');
  const channel = parseChannel(subject.slice(0, colon));
  const address = subject.slice(colon + 1);
  if (colon < 0 || !channel || !address) return null;
  return (await verify(secret, `unsub:${subject}`, parts[1])) ? { channel, address } : null;
}

// Sign-in tokens

export interface SignInRef extends AddressRef {
  campaignId: string;
}

export async function signSignInToken(secret: string, ref: SignInRef): Promise<string> {
  const subject = `${ref.campaignId}:${ref.channel}:${ref.address}`;
  return `${encodeText(subject)}.${await sign(secret, `portion:${subject}`)}`;
}

export async function verifySignInToken(secret: string, token: string): Promise<SignInRef | null> {
  const parts = split(token);
  if (!parts) return null;
  const subject = decodeText(parts[0]);
  if (subject === null) return null;
  const [campaignId, channelText, ...rest] = subject.split(':');
  const channel = parseChannel(channelText ?? '');
  const address = rest.join(':');
  if (!campaignId || !channel || !address) return null;
  return (await verify(secret, `portion:${subject}`, parts[1])) ? { campaignId, channel, address } : null;
}

// Either kind of token that opens a my-portion page

export type PortionRef = { kind: 'manage'; participantId: string } | ({ kind: 'signin' } & SignInRef);

export async function verifyPortionToken(secret: string, token: string): Promise<PortionRef | null> {
  const participantId = await verifyManageToken(secret, token);
  if (participantId) return { kind: 'manage', participantId };
  const signIn = await verifySignInToken(secret, token);
  return signIn ? { kind: 'signin', ...signIn } : null;
}

// Hashing for values stored only as hashes (session tokens, login codes)

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}


import { createHmac } from 'node:crypto';

// The test server's TOKEN_SECRET, set in scripts/e2e-server.mjs. These mirror
// worker/domain/tokens.ts so tests can open seeded people's private pages.
const SECRET = 'e2e-token-secret';

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');

export const manageToken = (participantId: string) => `${participantId}.${sign(`manage:${participantId}`)}`;

export function signInToken(campaignId: string, channel: 'sms' | 'email', address: string) {
  const subject = `${campaignId}:${channel}:${address}`;
  return `${Buffer.from(subject).toString('base64url')}.${sign(`portion:${subject}`)}`;
}

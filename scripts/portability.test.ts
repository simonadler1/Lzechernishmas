import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';

/**
 * The project must deploy to any Cloudflare account, so account-specific values
 * may appear only in wrangler.jsonc. This scans the code for them.
 */

const ROOTS = ['worker', 'src', 'shared', 'scripts'];
const SELF = join('scripts', 'portability.test.ts');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|mjs|js|json|css|html)$/.test(name) ? [path] : [];
  });
}

const PATTERNS: [string, RegExp][] = [
  ['a Cloudflare account id', /\b[0-9a-f]{32}\b/],
  ['a database id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/],
  ['a workers.dev address', /workers\.dev/],
];

interface WranglerEnv {
  d1_databases?: { database_id?: string }[];
  routes?: (string | { pattern: string })[];
  vars?: { APP_URL?: string };
}

/** Whatever real values wrangler.jsonc holds once the owner has filled it in. */
function configuredValues(): string[] {
  const config = parse(readFileSync('wrangler.jsonc', 'utf8'));
  const values: (string | undefined)[] = [config.account_id];
  for (const env of Object.values<WranglerEnv>(config.env ?? {})) {
    values.push(env.d1_databases?.[0]?.database_id);
    for (const route of env.routes ?? []) values.push(typeof route === 'string' ? route : route.pattern);
    try {
      values.push(new URL(env.vars?.APP_URL ?? '').host);
    } catch {
      // Still a placeholder.
    }
  }
  return values.filter((v): v is string => typeof v === 'string' && v.length > 3 && !v.includes('REPLACE'));
}

describe('portability', () => {
  it('keeps account ids, database ids and site addresses out of the code', () => {
    const configured = configuredValues();
    const found: string[] = [];
    for (const path of ROOTS.flatMap(files)) {
      if (path === SELF) continue;
      const text = readFileSync(path, 'utf8');
      for (const [label, pattern] of PATTERNS) {
        const match = text.match(pattern);
        if (match) found.push(`${path}: ${label} (${match[0]})`);
      }
      for (const value of configured) {
        if (text.includes(value)) found.push(`${path}: a value from wrangler.jsonc (${value})`);
      }
    }
    expect(found).toEqual([]);
  });

  it('would catch each kind of value', () => {
    expect('e572dbd94bf5747389728b815ca0ac5f').toMatch(PATTERNS[0]![1]);
    expect('0b1d7c5e-3a63-4d0b-9a0c-5f1f6f0a2b11').toMatch(PATTERNS[1]![1]);
    expect('https://lzecher-nishmas-preview.someone.workers.dev').toMatch(PATTERNS[2]![1]);
  });
});

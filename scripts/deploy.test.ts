import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { DeployRefused, checkFlattenedConfig, findPlaceholders, runDeploy, smokeVerdict } from './lib/deploy-logic.mjs';

const ACCOUNT = 'a'.repeat(32);

/** A wrangler.jsonc with every placeholder filled in. */
function readyConfig() {
  return {
    name: 'lzecher-nishmas',
    account_id: ACCOUNT,
    env: {
      preview: {
        vars: { ENVIRONMENT: 'preview', MESSAGING_MODE: 'mock', APP_URL: 'https://preview.example.test' },
        d1_databases: [{ binding: 'DB', database_name: 'lzecher-nishmas-preview', database_id: 'db-preview' }],
      },
      production: {
        routes: [{ pattern: 'chart.example.test', custom_domain: true }],
        vars: { ENVIRONMENT: 'production', MESSAGING_MODE: 'provider', APP_URL: 'https://chart.example.test' },
        d1_databases: [{ binding: 'DB', database_name: 'lzecher-nishmas-production', database_id: 'db-production' }],
      },
    },
  };
}

type Config = ReturnType<typeof readyConfig>;

interface Overrides {
  config?: Config;
  git?: Partial<{ dirty: boolean; branch: string; head: string; upstreamHead: string | null }>;
  whoami?: unknown;
  typed?: string;
  flattenedName?: string;
  failAt?: string;
  outbox?: { status: number; body: string };
  health?: { status: number; body: string };
}

/** Fake Wrangler and git. `calls` records the order of every outside effect. */
function harness(target: 'preview' | 'production', overrides: Overrides = {}) {
  const calls: string[] = [];
  const config = overrides.config ?? readyConfig();
  const step = (name: string) => {
    calls.push(name);
    if (overrides.failAt === name) throw new Error(`${name} failed`);
  };
  const deps = {
    readConfig: () => config,
    whoami: () => {
      step('whoami');
      return overrides.whoami ?? { loggedIn: true, accounts: [{ id: ACCOUNT, name: 'Project account' }] };
    },
    gitState: () => {
      step('git');
      return { dirty: false, branch: 'main', head: 'abc123', upstreamHead: 'abc123', ...overrides.git };
    },
    runChecks: () => step('checks'),
    confirm: async () => {
      step('confirm');
      return overrides.typed ?? 'production';
    },
    bookmark: () => {
      step('bookmark');
      return 'bookmark-1';
    },
    migrate: () => step('migrate'),
    build: () => step('build'),
    readFlattened: () => ({
      name: overrides.flattenedName ?? `lzecher-nishmas-${target}`,
      account_id: config.account_id,
      vars: config.env[target].vars,
      d1_databases: config.env[target].d1_databases,
    }),
    deploy: ({ dryRun }: { dryRun: boolean }) => step(dryRun ? 'deploy --dry-run' : 'deploy'),
    fetch: async (url: string) => {
      step(`fetch ${new URL(url).pathname}`);
      if (url.endsWith('/api/health')) {
        return (
          overrides.health ?? {
            status: 200,
            body: JSON.stringify({ ok: true, environment: target, commit: 'abc123' }),
          }
        );
      }
      return overrides.outbox ?? (target === 'production' ? { status: 404, body: '{}' } : { status: 302, body: '' });
    },
  };
  return { calls, deploy: (dryRun = false) => runDeploy({ target, dryRun }, deps) };
}

const withPlaceholders = () => parse(readFileSync('wrangler.jsonc', 'utf8')) as Config;

describe('production deploy', () => {
  it('runs every step in order', async () => {
    const { calls, deploy } = harness('production');
    const result = await deploy();
    expect(calls).toEqual([
      'whoami', 'git', 'checks', 'confirm', 'bookmark', 'migrate', 'build', 'deploy',
      'fetch /api/health', 'fetch /api/dev/outbox',
    ]);
    expect(result).toMatchObject({ commit: 'abc123', bookmark: 'bookmark-1', url: 'https://chart.example.test' });
  });

  it.each([
    ['a dirty tree', { git: { dirty: true } }, /uncommitted/],
    ['a branch other than main', { git: { branch: 'feature' } }, /deploys from main/],
    ['main behind origin/main', { git: { upstreamHead: 'def456' } }, /not level with origin\/main/],
    ['no reachable origin/main', { git: { upstreamHead: null } }, /origin\/main/],
    ['the wrong typed confirmation', { typed: 'yes' }, /Not confirmed/],
  ] as const)('is refused on %s', async (_name, overrides, message) => {
    const { calls, deploy } = harness('production', overrides as Overrides);
    await expect(deploy()).rejects.toThrow(message);
    await expect(deploy()).rejects.toBeInstanceOf(DeployRefused);
    expect(calls).not.toContain('migrate');
    expect(calls).not.toContain('deploy');
  });

  it('is refused while messaging is mocked, before anything runs', async () => {
    const config = readyConfig();
    config.env.production.vars.MESSAGING_MODE = 'mock';
    const { calls, deploy } = harness('production', { config });
    await expect(deploy()).rejects.toThrow(/MESSAGING_MODE "mock"/);
    expect(calls).toEqual([]);
  });

  it('fails the smoke test when the outbox is not 404', async () => {
    const { deploy } = harness('production', { outbox: { status: 200, body: '{"messages":[]}' } });
    await expect(deploy()).rejects.toThrow(/outbox answered 200 in production/);
  });

  it('fails the smoke test when health reports another commit', async () => {
    const { deploy } = harness('production', {
      health: { status: 200, body: JSON.stringify({ ok: true, environment: 'production', commit: 'old' }) },
    });
    await expect(deploy()).rejects.toThrow(/reports commit old/);
  });
});

describe('preview deploy', () => {
  it('needs no main branch, confirmation or bookmark', async () => {
    const { calls, deploy } = harness('preview', { git: { branch: 'feature', upstreamHead: null } });
    await deploy();
    expect(calls).toEqual(['whoami', 'git', 'checks', 'migrate', 'build', 'deploy', 'fetch /api/health', 'fetch /api/dev/outbox']);
  });

  it('is refused on a dirty tree', async () => {
    await expect(harness('preview', { git: { dirty: true } }).deploy()).rejects.toThrow(/uncommitted/);
  });

  it('fails the smoke test when the outbox is readable without Access', async () => {
    const { deploy } = harness('preview', { outbox: { status: 200, body: '{"messages":[{"to":"a@b.co"}]}' } });
    await expect(deploy()).rejects.toThrow(/readable without signing in/);
  });

  it('passes the smoke test when Access answers with its own login page', async () => {
    const { deploy } = harness('preview', { outbox: { status: 200, body: '<html>Sign in</html>' } });
    await expect(deploy()).resolves.toMatchObject({ target: 'preview' });
  });
});

describe.each(['preview', 'production'] as const)('%s safety checks', (target) => {
  it('refuses a real deploy while a REPLACE value remains', async () => {
    const { calls, deploy } = harness(target, { config: withPlaceholders() });
    await expect(deploy()).rejects.toThrow(/REPLACE/);
    expect(calls).toEqual([]);
  });

  it('still allows a dry run with the placeholders', async () => {
    const { calls, deploy } = harness(target, { config: withPlaceholders() });
    await expect(deploy(true)).resolves.toMatchObject({ dryRun: true });
    expect(calls).toEqual(['build', 'deploy --dry-run']);
  });

  it('refuses when the login lacks the configured account', async () => {
    const whoami = { loggedIn: true, accounts: [{ id: 'b'.repeat(32), name: 'Some other account' }] };
    const { calls, deploy } = harness(target, { whoami });
    await expect(deploy()).rejects.toThrow(/no access to the project's account/);
    expect(calls).toEqual(['whoami']);
  });

  it('refuses when not logged in', async () => {
    await expect(harness(target, { whoami: { loggedIn: false } }).deploy()).rejects.toThrow(/Not logged in/);
  });

  it('stops before deploying when the build names the wrong Worker', async () => {
    const { calls, deploy } = harness(target, { flattenedName: 'lzecher-nishmas' });
    await expect(deploy()).rejects.toThrow(/build is for Worker "lzecher-nishmas"/);
    expect(calls).toContain('build');
    expect(calls).not.toContain('deploy');
  });

  it.each(['checks', 'migrate', 'build', 'deploy'])('stops at a failing %s step', async (failAt) => {
    const { calls, deploy } = harness(target, { failAt });
    await expect(deploy()).rejects.toThrow(`${failAt} failed`);
    expect(calls.at(-1)).toBe(failAt);
  });

  it('migrates before building and builds before deploying', async () => {
    const { calls, deploy } = harness(target);
    await deploy();
    expect(calls.indexOf('migrate')).toBeLessThan(calls.indexOf('build'));
    expect(calls.indexOf('build')).toBeLessThan(calls.indexOf('deploy'));
  });
});

describe('helpers', () => {
  it('lists the placeholders in the committed config', () => {
    const config = withPlaceholders();
    expect(findPlaceholders(config, 'preview')).toEqual([
      'account_id', 'env.preview.vars.APP_URL', 'env.preview.d1_databases[0].database_id',
    ]);
    expect(findPlaceholders(config, 'production')).toEqual([
      'account_id', 'env.production.vars.APP_URL', 'env.production.d1_databases[0].database_id',
      'env.production.routes[0].pattern',
    ]);
    expect(findPlaceholders(readyConfig(), 'production')).toEqual([]);
  });

  it('rejects a build made for another environment', () => {
    const flat = {
      name: 'lzecher-nishmas-production',
      vars: { ENVIRONMENT: 'preview' },
      d1_databases: [{ binding: 'DB', database_name: 'lzecher-nishmas-production' }],
    };
    expect(() => checkFlattenedConfig(flat, 'production')).toThrow(/ENVIRONMENT "preview"/);
    flat.vars.ENVIRONMENT = 'production';
    flat.d1_databases[0]!.database_name = 'lzecher-nishmas-preview';
    expect(() => checkFlattenedConfig(flat, 'production')).toThrow(/database "lzecher-nishmas-preview"/);
  });

  it('judges a redirect from Access as protected', () => {
    expect(smokeVerdict('preview', { health: { status: 302, body: '' }, outbox: { status: 302, body: '' }, commit: 'x' })).toEqual([]);
  });
});

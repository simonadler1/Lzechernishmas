import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { runSetup } from './lib/cf-setup-logic.mjs';

const ACCOUNTS = [
  { id: 'a'.repeat(32), name: 'Personal' },
  { id: 'b'.repeat(32), name: 'Project' },
];

function harness(options: { choose?: string | null; existing?: { name: string; uuid: string }[] } = {}) {
  let text = readFileSync('wrangler.jsonc', 'utf8');
  const databases = [...(options.existing ?? [])];
  const created: string[] = [];
  let writes = 0;
  const deps = {
    whoami: () => ({ loggedIn: true, accounts: ACCOUNTS }),
    chooseAccount: async () => (options.choose === undefined ? ACCOUNTS[1]!.id : options.choose),
    readConfigText: () => text,
    writeConfigText: (next: string) => {
      text = next;
      writes++;
    },
    listDatabases: () => databases,
    createDatabase: (_account: string, name: string) => {
      const uuid = `uuid-${name}`;
      databases.push({ name, uuid });
      created.push(name);
      return uuid;
    },
  };
  return { deps, created, text: () => text, writes: () => writes };
}

describe('cf:setup', () => {
  it('creates missing databases and writes the account and ids', async () => {
    const h = harness();
    const result = await runSetup(h.deps);
    expect(h.created).toEqual(['lzecher-nishmas-preview', 'lzecher-nishmas-production']);
    expect(result).toMatchObject({ accountId: ACCOUNTS[1]!.id, changed: true });
    const config = parse(h.text());
    expect(config.account_id).toBe(ACCOUNTS[1]!.id);
    expect(config.env.preview.d1_databases[0].database_id).toBe('uuid-lzecher-nishmas-preview');
    expect(config.env.production.d1_databases[0].database_id).toBe('uuid-lzecher-nishmas-production');
    // The local database and everything else are untouched.
    expect(config.d1_databases[0].database_id).toBe('local');
    expect(config.env.preview.vars.APP_URL).toBe('REPLACE_PREVIEW_URL');
  });

  it('reuses databases that already exist', async () => {
    const h = harness({
      existing: [
        { name: 'lzecher-nishmas-preview', uuid: 'existing-preview' },
        { name: 'unrelated', uuid: 'nope' },
      ],
    });
    await runSetup(h.deps);
    expect(h.created).toEqual(['lzecher-nishmas-production']);
    expect(parse(h.text()).env.preview.d1_databases[0].database_id).toBe('existing-preview');
  });

  it('stops without an explicit account choice', async () => {
    const h = harness({ choose: null });
    await expect(runSetup(h.deps)).rejects.toThrow(/No account chosen/);
    expect(h.created).toEqual([]);
    expect(h.writes()).toBe(0);
  });

  it('keeps the comments in wrangler.jsonc', async () => {
    const h = harness();
    const before = readFileSync('wrangler.jsonc', 'utf8');
    await runSetup(h.deps);
    const comments = (text: string) => text.split('\n').filter((line) => line.trim().startsWith('//'));
    expect(comments(h.text())).toEqual(comments(before));
    expect(comments(before).length).toBeGreaterThan(5);
  });

  it('changes nothing on a second run', async () => {
    const h = harness();
    await runSetup(h.deps);
    const after = h.text();
    const second = await runSetup(h.deps);
    expect(second).toMatchObject({ changed: false, created: [] });
    expect(h.text()).toBe(after);
    expect(h.writes()).toBe(1);
  });
});

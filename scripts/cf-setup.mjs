// Usage: pnpm cf:setup
// Points wrangler.jsonc at a Cloudflare account and finds or creates its two
// databases. Safe to run again. See "One-time setup" in docs/DEPLOYING.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { runSetup } from './lib/cf-setup-logic.mjs';
import { parseJsonOutput, wranglerCapture } from './lib/shell.mjs';

const CONFIG = 'wrangler.jsonc';
const forAccount = (accountId) => ({ env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } });

const deps = {
  log: (line) => console.log(line),
  whoami: () => parseJsonOutput(wranglerCapture(['whoami', '--json'])),
  chooseAccount: async (accounts) => {
    console.log('\nCloudflare accounts on this login:');
    accounts.forEach((account, i) => console.log(`  ${i + 1}. ${account.name} (${account.id})`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question('\nWhich account should this project use? Enter its number: ')).trim();
      return accounts[Number(answer) - 1]?.id ?? null;
    } finally {
      rl.close();
    }
  },
  readConfigText: () => readFileSync(CONFIG, 'utf8'),
  writeConfigText: (text) => writeFileSync(CONFIG, text),
  listDatabases: (accountId) => parseJsonOutput(wranglerCapture(['d1', 'list', '--json'], forAccount(accountId))),
  createDatabase: (accountId, name) => {
    wranglerCapture(['d1', 'create', name], forAccount(accountId));
    const created = parseJsonOutput(wranglerCapture(['d1', 'list', '--json'], forAccount(accountId))).find(
      (db) => db.name === name,
    );
    if (!created) throw new Error(`Created ${name} but could not find it afterward.`);
    return created.uuid;
  },
};

try {
  await runSetup(deps);
} catch (error) {
  console.error(`\nSetup stopped: ${error.message}`);
  process.exit(1);
}

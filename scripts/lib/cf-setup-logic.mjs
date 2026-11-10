// The decisions behind `pnpm cf:setup`. scripts/cf-setup.mjs supplies the real
// Wrangler calls and the prompt.
import { applyEdits, modify, parse } from 'jsonc-parser';
import { TARGETS, databaseName } from './deploy-logic.mjs';

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

/** Sets one value in the JSONC text, leaving comments and layout as they are. */
function setValue(text, path, value) {
  return applyEdits(text, modify(text, path, value, FORMAT));
}

/**
 * Points wrangler.jsonc at one Cloudflare account: writes `account_id` and the
 * database ids, creating only the databases that do not exist yet. Running it
 * again changes nothing.
 */
export async function runSetup(deps) {
  const log = deps.log ?? (() => {});
  const whoami = await deps.whoami();
  if (!whoami?.loggedIn) throw new Error('Not logged in to Cloudflare. Run: pnpm exec wrangler login');
  const accounts = whoami.accounts ?? [];
  if (accounts.length === 0) throw new Error('Your Cloudflare login has no accounts.');

  // Always asked, even with one account, so nothing is created somewhere by accident.
  const chosenId = await deps.chooseAccount(accounts);
  const account = accounts.find((a) => a.id === chosenId);
  if (!account) throw new Error('No account chosen. Nothing was changed.');

  const original = await deps.readConfigText();
  let text = original;
  if (parse(text).account_id !== account.id) text = setValue(text, ['account_id'], account.id);

  const existing = await deps.listDatabases(account.id);
  const created = [];
  for (const target of TARGETS) {
    const name = databaseName(target);
    let id = existing.find((db) => db.name === name)?.uuid;
    if (id) {
      log(`Found database ${name}.`);
    } else {
      id = await deps.createDatabase(account.id, name);
      created.push(name);
      log(`Created database ${name}.`);
    }
    const index = (parse(text).env?.[target]?.d1_databases ?? []).findIndex((d) => d.binding === 'DB');
    if (index < 0) throw new Error(`wrangler.jsonc has no DB binding for ${target}.`);
    if (parse(text).env[target].d1_databases[index].database_id !== id) {
      text = setValue(text, ['env', target, 'd1_databases', index, 'database_id'], id);
    }
  }

  const changed = text !== original;
  if (changed) await deps.writeConfigText(text);
  log(changed ? 'Updated wrangler.jsonc. Commit the change.' : 'wrangler.jsonc already matches this account.');
  return { accountId: account.id, created, changed };
}

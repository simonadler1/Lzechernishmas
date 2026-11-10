// The decisions behind `pnpm deploy:*`, kept free of Wrangler and git calls so
// they can be tested. scripts/deploy.mjs supplies the real commands.

export const PROJECT = 'lzecher-nishmas';
export const TARGETS = ['preview', 'production'];
export const FLATTENED_CONFIG = 'dist/lzecher_nishmas/wrangler.json';

export class DeployRefused extends Error {}

const refuse = (message) => {
  throw new DeployRefused(message);
};

export const workerName = (target) => `${PROJECT}-${target}`;
export const databaseName = (target) => `${PROJECT}-${target}`;

/** Paths in wrangler.jsonc that still hold a REPLACE placeholder for this target. */
export function findPlaceholders(config, target) {
  const env = config.env?.[target] ?? {};
  const values = {
    account_id: config.account_id,
    [`env.${target}.vars.APP_URL`]: env.vars?.APP_URL,
    [`env.${target}.d1_databases[0].database_id`]: env.d1_databases?.[0]?.database_id,
  };
  for (const [i, route] of (env.routes ?? []).entries()) {
    values[`env.${target}.routes[${i}].pattern`] = typeof route === 'string' ? route : route?.pattern;
  }
  return Object.entries(values)
    .filter(([, value]) => typeof value !== 'string' || value === '' || value.includes('REPLACE'))
    .map(([path]) => path);
}

export function checkConfig(config, target) {
  const missing = findPlaceholders(config, target);
  if (missing.length > 0) {
    refuse(
      `wrangler.jsonc still has REPLACE values for ${target}: ${missing.join(', ')}. ` +
        'The account or domain is not chosen yet. See "One-time setup" in docs/DEPLOYING.md.',
    );
  }
  if (target === 'production' && config.env.production.vars.MESSAGING_MODE === 'mock') {
    refuse(
      'Production cannot run with MESSAGING_MODE "mock": nobody would receive a login code. ' +
        'Add a real provider first. See docs/messaging-providers.md.',
    );
  }
}

/** Developers may belong to several accounts, so the configured one must be among them. */
export function checkAccount(whoami, accountId) {
  if (!whoami?.loggedIn) refuse('Not logged in to Cloudflare. Run: pnpm exec wrangler login');
  const account = (whoami.accounts ?? []).find((a) => a.id === accountId);
  if (!account) {
    refuse(
      `Your Cloudflare login has no access to the project's account (${accountId}). ` +
        'Accept the invitation to that account, then run: pnpm exec wrangler login',
    );
  }
  return account;
}

export function checkGit(git, target) {
  if (git.dirty) refuse('The working tree has uncommitted changes. Commit or stash them, then deploy.');
  if (target !== 'production') return;
  if (git.branch !== 'master') refuse(`Production deploys from master. You are on "${git.branch}".`);
  if (!git.upstreamHead) refuse('Could not read origin/master. Check your connection, then try again.');
  if (git.head !== git.upstreamHead) {
    refuse('master is not level with origin/master. Run `git pull`, or push your commits, then deploy.');
  }
}

/** The build must have targeted this environment, or the wrong Worker would be replaced. */
export function checkFlattenedConfig(flat, target, { allowPlaceholders = false } = {}) {
  if (flat.name !== workerName(target)) {
    refuse(`The build is for Worker "${flat.name}", not "${workerName(target)}". Stopping before deploying.`);
  }
  const database = flat.d1_databases?.find((d) => d.binding === 'DB');
  if (database?.database_name !== databaseName(target)) {
    refuse(`The build uses database "${database?.database_name}", not "${databaseName(target)}".`);
  }
  if (flat.vars?.ENVIRONMENT !== target) {
    refuse(`The build has ENVIRONMENT "${flat.vars?.ENVIRONMENT}", not "${target}".`);
  }
  if (!allowPlaceholders && JSON.stringify([flat.account_id, database, flat.vars, flat.routes]).includes('REPLACE')) {
    refuse('The build still contains REPLACE values.');
  }
}

/**
 * Judges the deployed site. `health` and `outbox` are `{ status, body }` from
 * unauthenticated requests that did not follow redirects.
 */
export function smokeVerdict(target, { health, outbox, commit }) {
  const problems = [];
  const json = (response) => {
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  };
  if (target === 'production') {
    const body = json(health);
    if (health.status !== 200 || body?.ok !== true) problems.push(`/api/health answered ${health.status}.`);
    else if (body.commit !== commit) problems.push(`/api/health reports commit ${body.commit}, expected ${commit}.`);
    else if (body.environment !== 'production') problems.push(`/api/health reports environment ${body.environment}.`);
    if (outbox.status !== 404) problems.push(`/api/dev/outbox answered ${outbox.status} in production. It must be 404.`);
  } else {
    // Without Cloudflare Access, anyone could read login codes and phone numbers here.
    if (outbox.status === 200 && Array.isArray(json(outbox)?.messages)) {
      problems.push(
        'The preview outbox is readable without signing in. Turn on Cloudflare Access for the preview Worker before sharing its address.',
      );
    }
  }
  return problems;
}

/**
 * Runs one deploy. Every outside effect comes from `deps`, in this order:
 * config and account checks, git checks, tests, confirmation, bookmark,
 * migrations, build, deploy, smoke test. Any failure stops the rest.
 */
export async function runDeploy({ target, dryRun = false }, deps) {
  if (!TARGETS.includes(target)) refuse(`Unknown target "${target}". Use preview or production.`);
  const log = deps.log ?? (() => {});
  const config = await deps.readConfig();

  if (dryRun) {
    log(`Dry run for ${target}: nothing remote is touched.`);
    await deps.build(target);
    checkFlattenedConfig(await deps.readFlattened(), target, { allowPlaceholders: true });
    await deps.deploy({ dryRun: true });
    return { target, dryRun: true };
  }

  checkConfig(config, target);
  const account = checkAccount(await deps.whoami(), config.account_id);
  log(`Deploying ${target} to Cloudflare account "${account.name}" (${account.id}).`);

  const git = await deps.gitState();
  checkGit(git, target);

  await deps.runChecks(target);

  let bookmark = null;
  if (target === 'production') {
    const typed = await deps.confirm('This replaces the live site. Type "production" to continue: ');
    if (typed.trim() !== 'production') refuse('Not confirmed. Nothing was deployed.');
    bookmark = await deps.bookmark();
    log(`Database bookmark before this deploy: ${bookmark}`);
  }

  await deps.migrate(target);
  await deps.build(target);
  checkFlattenedConfig(await deps.readFlattened(), target);
  await deps.deploy({ dryRun: false });

  const url = config.env[target].vars.APP_URL.replace(/\/+$/, '');
  const problems = smokeVerdict(target, {
    health: await deps.fetch(`${url}/api/health`),
    outbox: await deps.fetch(`${url}/api/dev/outbox`),
    commit: git.head,
  });
  if (problems.length > 0) {
    throw new Error(`Deployed, but the smoke test failed:\n- ${problems.join('\n- ')}\n${rollbackHint(target)}`);
  }

  log(`Deployed ${git.head} to ${url}`);
  log(rollbackHint(target));
  return { target, dryRun: false, url, commit: git.head, bookmark };
}

export const rollbackHint = (target) => `To undo: pnpm exec wrangler rollback --name ${workerName(target)}`;

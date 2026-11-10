// Usage: node scripts/deploy.mjs <preview|production> [--dry-run]
// Run through `pnpm deploy:preview`, `pnpm deploy:production` or `pnpm deploy:check`.
// The rules it enforces are in scripts/lib/deploy-logic.mjs and docs/DEPLOYING.md.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parse } from 'jsonc-parser';
import { DeployRefused, FLATTENED_CONFIG, databaseName, runDeploy } from './lib/deploy-logic.mjs';
import { capture, parseJsonOutput, run, wrangler, wranglerCapture } from './lib/shell.mjs';

const CONFIG = 'wrangler.jsonc';
const [target, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

const deps = {
  log: (line) => console.log(`\n▸ ${line}`),
  readConfig: () => parse(readFileSync(CONFIG, 'utf8')),
  whoami: () => parseJsonOutput(wranglerCapture(['whoami', '--json'])),
  gitState: () => {
    let upstreamHead = null;
    try {
      capture('git', ['fetch', '--quiet', 'origin', 'master']);
      upstreamHead = capture('git', ['rev-parse', '--short=12', 'origin/master']);
    } catch {
      // Only production needs origin/master, and checkGit reports it.
    }
    return {
      dirty: capture('git', ['status', '--porcelain']) !== '',
      branch: capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      head: capture('git', ['rev-parse', '--short=12', 'HEAD']),
      upstreamHead,
    };
  },
  runChecks: (name) => {
    run('pnpm', ['typecheck']);
    run('pnpm', ['lint']);
    run('pnpm', ['test']);
    if (name === 'production') run('pnpm', ['test:e2e']);
  },
  confirm: async (prompt) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(prompt);
    } finally {
      rl.close();
    }
  },
  bookmark: () => {
    const info = parseJsonOutput(
      wranglerCapture(['d1', 'time-travel', 'info', databaseName('production'), '--json', '--config', CONFIG, '--env', 'production']),
    );
    return info.bookmark ?? JSON.stringify(info);
  },
  // --config and --env make Wrangler read the source config, not a flattened one left by an earlier build.
  migrate: (name) => wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', CONFIG, '--env', name]),
  // The environment is fixed at build time. `wrangler deploy` then uses the flattened config the build wrote.
  build: (name) => run('pnpm', ['exec', 'vite', 'build'], { env: { ...process.env, CLOUDFLARE_ENV: name } }),
  readFlattened: () => JSON.parse(readFileSync(FLATTENED_CONFIG, 'utf8')),
  deploy: ({ dryRun: dry }) => wrangler(['deploy', ...(dry ? ['--dry-run'] : [])]),
  fetch: async (url) => {
    const res = await fetch(url, { redirect: 'manual' });
    return { status: res.status, body: await res.text() };
  },
};

try {
  await runDeploy({ target, dryRun }, deps);
} catch (error) {
  console.error(`\n${error instanceof DeployRefused ? 'Deploy refused' : 'Deploy failed'}: ${error.message}`);
  process.exit(1);
}

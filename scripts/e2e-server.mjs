// Serves what ships: a production build, run by Wrangler, on a throwaway local
// database. Playwright starts this through `webServer` in playwright.config.ts.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const PORT = process.env.E2E_PORT ?? '8788';
const STATE = '.e2e/state';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(STATE, { recursive: true, force: true });
run('pnpm', ['exec', 'vite', 'build']);
run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE, '--config', 'wrangler.jsonc']);

const server = spawn(
  'pnpm',
  [
    'exec', 'wrangler', 'dev',
    '--config', 'dist/lzecher_nishmas/wrangler.json',
    '--persist-to', STATE,
    '--port', PORT,
    '--var', 'TOKEN_SECRET:e2e-token-secret',
    '--var', `APP_URL:http://localhost:${PORT}`,
    '--show-interactive-dev-session=false',
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));

// Screenshot comparison. Baselines are made in Chromium on macOS, and fonts
// render differently elsewhere, so on any other system this is skipped.
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  console.log('Visual snapshots skipped: baselines are only valid on macOS.');
  process.exit(0);
}

const update = process.argv.includes('--update');
const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', 'e2e/pages.spec.ts', // 'all' rewrites every baseline, including ones still inside the tolerance.
  ...(update ? ['--update-snapshots=all'] : [])],
  { stdio: 'inherit', env: { ...process.env, VISUAL: '1' } },
);
process.exit(result.status ?? 1);

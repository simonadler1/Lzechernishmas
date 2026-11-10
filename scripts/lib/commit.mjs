import { execFileSync } from 'node:child_process';

/** Short hash of the current commit, or "dev" outside a git checkout. */
export function currentCommit() {
  if (process.env.COMMIT_SHA) return process.env.COMMIT_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

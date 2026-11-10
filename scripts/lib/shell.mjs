import { spawnSync } from 'node:child_process';

/** Runs a command, showing its output. Throws when it fails. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`Failed: ${command} ${args.join(' ')}`);
}

/** Runs a command and returns what it printed. */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (result.status !== 0) {
    throw new Error(`Failed: ${command} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export const wrangler = (args, options) => run('pnpm', ['exec', 'wrangler', ...args], options);
export const wranglerCapture = (args, options) => capture('pnpm', ['exec', 'wrangler', ...args], options);

/** Wrangler prints banners around JSON on some commands, so take the outermost JSON value. */
export function parseJsonOutput(text) {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (start < 0 || end < start) throw new Error(`Expected JSON from Wrangler, got:\n${text}`);
  return JSON.parse(text.slice(start, end + 1));
}

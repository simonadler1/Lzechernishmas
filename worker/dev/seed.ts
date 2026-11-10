/**
 * Named test data for the device suite, loaded by POST /api/dev/seed.
 * Every scenario starts from empty tables and uses fixed ids and slugs, so
 * pages render the same on every run.
 */

type Seeder = (env: Env) => Promise<void>;

// Children before parents, to satisfy foreign keys.
const TABLES = [
  'claims',
  'participant_login_codes',
  'contacts',
  'participants',
  'campaigns',
  'sessions',
  'login_codes',
  'users',
  'outbound_messages',
  'opt_outs',
  'rate_limits',
];

export async function resetDatabase(env: Env): Promise<void> {
  await env.DB.batch(TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
}

export const SCENARIOS: Record<string, Seeder> = {
  empty: async () => {},
};

export async function seed(env: Env, scenario: string): Promise<boolean> {
  const seeder = SCENARIOS[scenario];
  if (!seeder) return false;
  await resetDatabase(env);
  await seeder(env);
  return true;
}

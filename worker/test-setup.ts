import { applyD1Migrations, reset } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach } from 'vitest';

// Every test starts on an empty, fully migrated database.
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS ?? []);
});

afterEach(async () => {
  await reset();
});

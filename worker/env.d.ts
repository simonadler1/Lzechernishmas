// Values that are not in wrangler.jsonc, so `wrangler types` does not know them.

/** Short git commit of this build, injected by Vite. */
declare const __COMMIT__: string;

// `wrangler types` generates this interface; both `Env` and `Cloudflare.Env` extend it.
interface __BaseEnv_Env {
  /** Set to "on" in the Cloudflare dashboard to pause writes and reminders during an account move. */
  MAINTENANCE_MODE?: string;
  /** Only present in tests. See vitest.config.ts. */
  TEST_MIGRATIONS?: import('cloudflare:test').D1Migration[];
}

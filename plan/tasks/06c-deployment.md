# 06c: Cloudflare deployment and developer runbook

**Goal:** any developer on the team can deploy safely with one command, and the app is ready for a shared preview that real phones can reach.

**Read:** `DEPLOYMENT.md` in full. Check the installed Wrangler with `pnpm exec wrangler --help` and its config schema before relying on a flag in that document. If the `wrangler` skill from the Cloudflare plugin is available, load it.

## Build

- `wrangler.jsonc` in the shape given in `DEPLOYMENT.md`, with `REPLACE` values left visible for what only the owner knows.
- `GET /api/health` returns `{ ok, environment, commit }`, with the commit injected at build time.
- `/api/dev/seed` is available only when `ENVIRONMENT` is `development`. Outbox and run-reminders follow the table in `DEPLOYMENT.md`.
- `scripts/deploy.mjs` with every step listed, and the three package scripts.
- `scripts/cf-setup.mjs`, exposed as `pnpm cf:setup`: lists the logged-in user's accounts through `wrangler whoami` and requires an explicit choice, finds databases by name with `wrangler d1 list --json`, creates only the missing ones, and writes `account_id` and the IDs with `jsonc-parser` so comments survive.
- `MAINTENANCE_MODE` set to `on` makes every non-GET `/api/*` return 503 with a `maintenance` error code and the message "Signups are paused for a short while. Please try again soon." It also makes the `scheduled` handler do nothing. It is off by default.
- `backups/` in `.gitignore`.
- Keep the decision logic (git checks, config checks, step order, account checks, smoke-test verdicts) in testable functions, with Wrangler and git calls passed in.
- `docs/DEPLOYING.md`, moved from "One-time setup", "Moving to another Cloudflare account" and "Developer runbook", corrected to what you verified. Link it from the root `README.md`, creating one if needed.

## Boundaries

This task needs no Cloudflare account. Stay local and use `--dry-run`. Creating databases, setting secrets and deploying are run by the owner, or by an agent the owner has asked in that session.

## Done when

Tests prove the deploy logic:

- Production is refused on a dirty tree, off `master`, behind `origin/master`, with `MESSAGING_MODE=mock`, and without the typed confirmation.
- Real deploys to either environment are refused with a `REPLACE` value remaining, and when `whoami` lacks the configured account, while dry runs still work with the placeholders.
- `cf:setup` reuses existing databases, creates missing ones, stops without an explicit account choice, keeps comments in `wrangler.jsonc`, and produces no change on a second run.
- **Portability:** a test scans `worker/`, `src/`, `shared/` and `scripts/` and fails on any hard-coded account ID, database ID, `workers.dev` address or production domain.
- With `MAINTENANCE_MODE` on, a claim POST returns 503, the public chart GET still works, and a scheduled run sends nothing.
- Migrations run before the build, and the build runs before the deploy. A failure at any step stops the later ones.
- A flattened config naming the wrong Worker stops the deploy.
- The smoke test fails when preview returns outbox data without Access, and when production's outbox is not 404.

And by running:

- `pnpm deploy:check` builds the preview and production configs and completes `wrangler deploy --dry-run` for each, and the flattened output shows each environment's own Worker name, database and vars.
- `/api/dev/seed` is 404 with `ENVIRONMENT` set to `preview` and `production`.
- **Data move rehearsal:** migrate and seed a local database, export it with `wrangler d1 export --local`, import it into a fresh local database using a different `--persist-to` directory, then confirm row counts match and no migrations are pending. Cloudflare's docs do not say whether `d1_migrations` is exported, or how table order and foreign keys behave on import. If any step fails, fix it (for example with `PRAGMA defer_foreign_keys = true`) and update the move procedure.
- Every command in `docs/DEPLOYING.md` that can run locally has been run. The ones needing an account are listed in `PROGRESS.md` as not yet exercised.

## Out of scope

Automated deploys from CI, per-developer sandboxes, real messaging providers.

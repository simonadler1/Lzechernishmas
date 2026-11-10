# 01: Project scaffold

**Goal:** a running single-Worker app with the React SPA and a health endpoint, and the quality commands every later task relies on.

**Read:** `ARCHITECTURE.md` (Stack, Layout, Environment convention).

## Build

- `git init` with a sensible `.gitignore` (including `.dev.vars`, `.wrangler`). The `plan/` folder is tracked.
- pnpm project at the repo root using the Layout in `ARCHITECTURE.md`, with Vite, `@cloudflare/vite-plugin`, React, TypeScript strict, Hono, Tailwind.
- `wrangler.jsonc` with Static Assets in SPA mode, `/api/*` routed to the Worker first, a local D1 binding `DB`, an hourly cron `0 * * * *` with an empty `scheduled` handler, and vars `ENVIRONMENT=development`, `MESSAGING_MODE=mock`, `APP_URL` set to the local dev address. Task 06c adds the deployed environments.
- `.dev.vars.example` listing `TOKEN_SECRET`.
- `GET /api/health` returning `{ "ok": true }`.
- Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e` (placeholder until task 06b), `db:migrate:local`.
- Vitest with `@cloudflare/vitest-pool-workers` and one test of the health route.

## Done when

- `pnpm dev` serves the SPA, and `/api/health` responds from the same origin.
- A deep link such as `/c/anything` loads the SPA rather than a 404.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Out of scope

Database tables, routing libraries in the SPA, any feature UI.

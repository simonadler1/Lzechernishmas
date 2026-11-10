# Deployment plan and developer runbook

Task 06c builds what this describes, then moves "One-time setup", "Moving to another Cloudflare account" and "Developer runbook" into `docs/DEPLOYING.md`, corrected to match what actually ran.

The Cloudflare account and production domain are undecided. The project must stay deployable to any account: every account-specific value lives in `wrangler.jsonc`, and code reads addresses from `APP_URL`.

## Environments

| | Local | Preview | Production |
| --- | --- | --- | --- |
| Purpose | Daily development | Shared team testing, real-phone checks | Real campaigns |
| Worker | runs on your machine | `lzecher-nishmas-preview` | `lzecher-nishmas-production` |
| Address | `localhost` | `workers.dev`, behind Cloudflare Access | Custom domain |
| D1 database | local file | `lzecher-nishmas-preview` | `lzecher-nishmas-production` |
| `ENVIRONMENT` | `development` | `preview` | `production` |
| Messaging | mock | mock | real provider, required |
| `/api/dev/seed` | on | off | off |
| Outbox, run-reminders | on | on, behind Access | off |
| Cloudflare account needed | no | yes | yes |

Preview is behind Cloudflare Access because its outbox displays login codes and phone numbers. Testers sign in once with their email.

## Rules that are easy to get wrong

- **The environment is chosen at build time.** With the Cloudflare Vite plugin, build with `CLOUDFLARE_ENV=<name>` and then run plain `wrangler deploy`. Setting the environment at deploy time does not retarget the flattened build output. Everyone deploys through the script below so this cannot go wrong.
- **Bindings and vars are repeated per environment.** `d1_databases` and `vars` do not inherit. `triggers`, `assets`, `workers_dev`, `preview_urls` and `routes` do.
- **Migrations run before the build**, using `--config wrangler.jsonc --env <name>`, so Wrangler reads the source config rather than a leftover flattened one.
- **Migrations must work with the code already running.** Add columns and tables in one release, and remove old ones in a later release. Rollback restores code only.
- **Unmerged migrations stay off preview.** Preview is shared, so a branch's migration would break everyone else's deploys.
- **`TOKEN_SECRET` is not rotated casually.** Changing it breaks every my-portion and unsubscribe link already sent.
- **`wrangler secret put` deploys immediately.**
- **The QR sign must carry the final domain.** Printed signs cannot be updated, so production needs its permanent domain before the first real sign is printed.

## Config shape

`wrangler.jsonc`. IDs are not secret and are committed. The account-specific values are `account_id`, the two `database_id`s, preview's `APP_URL`, and production's domain and `APP_URL`. Local development and `pnpm deploy:check` work with the `REPLACE` placeholders still in place.

```jsonc
{
  "name": "lzecher-nishmas",
  "account_id": "REPLACE_ACCOUNT_ID",
  "main": "worker/index.ts",
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "triggers": { "crons": ["0 * * * *"] },
  "secrets": { "required": ["TOKEN_SECRET"] },
  "workers_dev": false,
  "preview_urls": false,
  "vars": { "ENVIRONMENT": "development", "MESSAGING_MODE": "mock", "APP_URL": "http://localhost:5173" },
  "d1_databases": [{ "binding": "DB", "database_name": "lzecher-nishmas-local", "database_id": "local", "migrations_dir": "migrations" }],
  "env": {
    "preview": {
      "workers_dev": true,
      "vars": { "ENVIRONMENT": "preview", "MESSAGING_MODE": "mock", "APP_URL": "REPLACE_PREVIEW_URL" },
      "d1_databases": [{ "binding": "DB", "database_name": "lzecher-nishmas-preview", "database_id": "REPLACE", "migrations_dir": "migrations" }]
    },
    "production": {
      "routes": [{ "pattern": "REPLACE_PRODUCTION_DOMAIN", "custom_domain": true }],
      "vars": { "ENVIRONMENT": "production", "MESSAGING_MODE": "mock", "APP_URL": "https://REPLACE_PRODUCTION_DOMAIN" },
      "d1_databases": [{ "binding": "DB", "database_name": "lzecher-nishmas-production", "database_id": "REPLACE", "migrations_dir": "migrations" }]
    }
  }
}
```

`workers_dev: false` and `preview_urls: false` keep production reachable only at its real domain, and leave no public address on preview that bypasses Access.

## What the deploy script does

`scripts/deploy.mjs <preview|production> [--dry-run]`, exposed as `pnpm deploy:preview`, `pnpm deploy:production` and `pnpm deploy:check`. (`pnpm deploy` is a built-in pnpm command, so it is avoided.)

1. Refuse a real deploy while `account_id` or this environment's values contain `REPLACE`. Confirm `wrangler whoami` has access to the configured `account_id`, and print that account's name and ID. Developers may belong to several accounts, so the deploy always targets the configured ID.
2. Require a clean working tree. Production also requires `main`, level with `origin/main`.
3. Run typecheck, lint and unit tests. Production also runs `test:e2e`.
4. Production only: refuse when `MESSAGING_MODE` is `mock`, then require typing `production` to confirm.
5. Production only: record the D1 Time Travel bookmark and print it.
6. Apply remote migrations.
7. Build with `CLOUDFLARE_ENV` set. Check that the flattened `wrangler.json` names the expected Worker and database.
8. Run `wrangler deploy`.
9. Smoke test, failing loudly on any miss:
   - Production: `/api/health` reports the deployed commit, and `/api/dev/outbox` is 404.
   - Preview: an unauthenticated `/api/dev/outbox` does not return outbox data, which proves Access is on.
10. Print the URL, the commit, and the rollback command.

`--dry-run` stops before anything remote, builds, and runs `wrangler deploy --dry-run`.

## One-time setup (project owner)

Do this once for each Cloudflare account the project lives in, when the account has been chosen. Workers Paid is recommended for production: D1 Time Travel keeps 30 days instead of 7, and Workers get more CPU per request.

1. `pnpm exec wrangler login`, as a member of the chosen account.
2. `pnpm cf:setup`. It lists your accounts and asks which to use, finds or creates both databases by name, and writes `account_id` and the database IDs into `wrangler.jsonc`. It is safe to re-run. Commit the result.
3. Keep every resource name exactly as configured, so the commands in this document work on any account.
4. Generate a value with `openssl rand -base64 32`, one per environment, and save each in the team's password manager first. Cloudflare cannot show a secret again, and moving accounts needs production's exact value. Then enter it at the prompt:
   `pnpm exec wrangler secret put TOKEN_SECRET --config wrangler.jsonc --env preview`
5. Run `pnpm deploy:preview`, and put the printed address into `APP_URL` for preview. The first run's smoke test fails until step 6 is done.
6. In the Cloudflare dashboard, open the preview Worker, turn on Cloudflare Access for its `workers.dev` address, and allow the team's emails.
7. Invite each developer under Manage Account, Members, with the Workers Platform Admin role. Cloudflare's role docs do not name D1 under this role, so have the first invited developer run `pnpm exec wrangler d1 migrations list DB --remote --config wrangler.jsonc --env preview`. If it is refused, grant a role that includes D1 and record which one here.

Before the first production deploy: the real email provider is live (organizers cannot log in without it), the domain is on the Cloudflare account and in `wrangler.jsonc`, and production's `TOKEN_SECRET` is set.

**Buying the domain.** Use a registrar other than Cloudflare Registrar, and point its nameservers at Cloudflare. Moving then only needs a nameserver change, while a domain registered through Cloudflare Registrar needs a manual inter-account transfer request. Buy it before printing any real sign.

## Moving to another Cloudflare account

**Before launch**, with no real data to keep: run "One-time setup" on the new account, commit `wrangler.jsonc`, and delete the old Workers and databases.

**After launch**, signups pause briefly, the public chart stays readable, and printed QR codes keep working because the domain stays the same.

Prepare, with no effect on the live site:

1. On a branch, sign in as a member of the new account and run `pnpm cf:setup`. Leave the branch unmerged, and do not deploy production to the new account yet, because its database must be empty for the import.
2. Set preview's secret, deploy preview, turn on Access, and invite the developers, as in "One-time setup".
3. Set production's `TOKEN_SECRET` on the new account to **the same value as the old account**. A new value breaks every my-portion, sign-in and unsubscribe link already sent.
4. Add the domain to the new account. Export the DNS records from the old zone and import them, including the email provider's records. Remove any DNSSEC and zone holds on the old zone.

Cut over, outside the 10:00 reminder hour if possible:

5. In the old account's dashboard, set the production Worker's variable `MAINTENANCE_MODE` to `on`. Writes return a "paused" message and reminders stop. Any reminder missed is sent after the move.
6. With `main` checked out, still configured for the old account, export the data to `backups/`, which is git-ignored:
   `pnpm exec wrangler d1 export lzecher-nishmas-production --remote --output=backups/move.sql --config wrangler.jsonc --env production`
7. Check out the branch and import:
   `pnpm exec wrangler d1 execute lzecher-nishmas-production --remote --file=backups/move.sql --config wrangler.jsonc --env production`
8. Run `SELECT COUNT(*)` on `campaigns`, `participants` and `claims` in both accounts, and stop if any count differs.
9. Change the nameservers at the registrar to the new account's, and wait until the domain shows **Active**.
10. Merge the branch to `main` and run `pnpm deploy:production`. The migration step should find nothing to apply.
11. Open a real campaign by scanning a printed sign, then sign in and take a test masechta, and release it.

Afterward:

12. Delete `backups/move.sql`, since it holds people's phone numbers and emails.
13. After a week without problems, delete the old production Worker and database. Leave `MAINTENANCE_MODE` on until then.

Developers without access to the new account can no longer deploy until they accept its invitation and run `pnpm exec wrangler login`.

## Developer runbook

### Get set up

You need the Node and pnpm versions in `package.json`, and an invitation to the Cloudflare account.

```sh
pnpm install
cp .dev.vars.example .dev.vars    # set TOKEN_SECRET to any long random string
pnpm db:migrate:local
pnpm dev
```

Local development needs no Cloudflare account. Read login codes at `/dev/outbox`.

To deploy, sign in once. Accept the emailed invitation first.

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami         # the project's account should be listed
```

### Deploy to preview

Commit your work, then:

```sh
pnpm deploy:preview
```

Preview is shared, so tell the team before replacing what is there. Any branch can go to preview, as long as it adds no unmerged migrations. Open the printed address and sign in with your email.

### Deploy to production

```sh
git switch main && git pull
pnpm deploy:production
```

Type `production` when asked. Check `pnpm exec wrangler tail lzecher-nishmas-production` for a few minutes afterward.

### Add a database change

```sh
pnpm exec wrangler d1 migrations create DB <short_description> --config wrangler.jsonc
pnpm db:migrate:local
```

The deploy script applies it remotely. Follow the migration rules above.

### Undo a bad deploy

```sh
pnpm exec wrangler deployments list --name lzecher-nishmas-production
pnpm exec wrangler rollback --name lzecher-nishmas-production
```

Rollback restores code only. Restoring the database discards everything written since the bookmark, including people's signups, so the project owner makes that call:

```sh
pnpm exec wrangler d1 time-travel restore lzecher-nishmas-production --bookmark=<printed bookmark>
```

### When something fails

| Symptom | Fix |
| --- | --- |
| Not authenticated, or wrong account | `pnpm exec wrangler login`, then check `whoami` |
| Permission error on D1 or secrets | Ask the owner to check your role |
| Deploy refused: missing `TOKEN_SECRET` | The owner sets it for that environment |
| Smoke test says preview outbox is exposed | Turn Access back on before sharing the address |
| Production refused: mock messaging | Expected until a real provider is added |
| Deploy refused: `REPLACE` value | The account or domain is not chosen yet, so ask the owner to finish "One-time setup" |
| Account listed by `whoami` is not the configured one | Accept the invitation to the project's account, then log in again |

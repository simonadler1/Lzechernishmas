# Deploying

How the app gets onto Cloudflare, for the project owner and for developers. The reasoning behind this setup is in `plan/DEPLOYMENT.md` and `plan/DECISIONS.md`.

The Cloudflare account and production domain are not chosen yet. Until they are, `wrangler.jsonc` holds `REPLACE` placeholders, real deploys are refused, and everything local works, including `pnpm deploy:check`.

## Environments

| | Local | Preview | Production |
| --- | --- | --- | --- |
| Purpose | Daily development | Shared team testing, real-phone checks | Real campaigns |
| Worker | runs on your machine | `lzecher-nishmas-preview` | `lzecher-nishmas-production` |
| Address | `localhost:5173` | the Worker's default address, behind Cloudflare Access | Custom domain |
| D1 database | local file | `lzecher-nishmas-preview` | `lzecher-nishmas-production` |
| Messaging | mock | mock | real provider, required |
| Test outbox at `/dev/outbox` | on | on, behind Access | off |
| `/api/dev/seed` | on | off | off |

## Commands

| Command | What it does |
| --- | --- |
| `pnpm deploy:check` | Builds preview and production and runs `wrangler deploy --dry-run` for each. Touches nothing remote. |
| `pnpm deploy:preview` | Checks, migrates, builds and deploys preview, then confirms the outbox is not public. |
| `pnpm deploy:production` | The same for production, from an up-to-date `main`, after you type `production`. |
| `pnpm cf:setup` | Points `wrangler.jsonc` at a Cloudflare account and finds or creates its databases. |

Always deploy through these commands. The environment is fixed when the app is built, and the script builds for the right one, runs migrations first, and checks the result. Running `wrangler deploy` by hand can replace the wrong Worker.

A real deploy is refused when:

- `wrangler.jsonc` still has a `REPLACE` value for that environment,
- your Cloudflare login has no access to the configured account,
- the working tree has uncommitted changes,
- (production) you are not on `main`, or `main` differs from `origin/main`,
- (production) `MESSAGING_MODE` is `mock`,
- typecheck, lint or tests fail.

## Rules that are easy to get wrong

- **Migrations must work with the code already running.** Add columns and tables in one release, and remove old ones in a later release. Rollback restores code only.
- **Unmerged migrations stay off preview.** Preview is shared, so a branch's migration would break everyone else's deploys.
- **`TOKEN_SECRET` is not rotated casually.** Changing it breaks every my-portion, sign-in and unsubscribe link already sent.
- **`wrangler secret put` takes effect immediately.**
- **The QR sign must carry the final domain.** Printed signs cannot be updated, so production needs its permanent domain before the first real sign is printed.

## One-time setup (project owner)

Do this once for each Cloudflare account the project lives in, when the account has been chosen. Workers Paid is recommended for production: D1 Time Travel keeps 30 days instead of 7, and Workers get more CPU per request.

1. `pnpm exec wrangler login`, as a member of the chosen account.
2. `pnpm cf:setup`. It lists your accounts and asks which to use, even when there is only one, finds or creates both databases by name, and writes `account_id` and the database IDs into `wrangler.jsonc`. It is safe to re-run. Commit the result.
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
6. With `main` checked out, still configured for the old account, export the data to `backups/`, which is git-ignored. The export takes the database's name, not its binding:
   `mkdir -p backups && pnpm exec wrangler d1 export lzecher-nishmas-production --remote --output=backups/move.sql --config wrangler.jsonc --env production`
7. Check out the branch and import:
   `pnpm exec wrangler d1 execute lzecher-nishmas-production --remote --file=backups/move.sql --config wrangler.jsonc --env production`
8. Run this on both accounts, from `main` for the old one and from the branch for the new one, and stop if any count differs:
   `pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --env production --command "SELECT (SELECT COUNT(*) FROM campaigns) AS campaigns, (SELECT COUNT(*) FROM participants) AS participants, (SELECT COUNT(*) FROM claims) AS claims"`
   Then confirm nothing is pending on the new account, because the export carries the `d1_migrations` table with it:
   `pnpm exec wrangler d1 migrations list DB --remote --config wrangler.jsonc --env production`
9. Change the nameservers at the registrar to the new account's, and wait until the domain shows **Active**.
10. Merge the branch to `main` and run `pnpm deploy:production`. The migration step should find nothing to apply.
11. Open a real campaign by scanning a printed sign, then sign in and take a test masechta, and release it.

Afterward:

12. Delete `backups/move.sql`, since it holds people's phone numbers and emails.
13. After a week without problems, delete the old production Worker and database. Leave `MAINTENANCE_MODE` on until then.

Developers without access to the new account can no longer deploy until they accept its invitation and run `pnpm exec wrangler login`.

### What the rehearsal showed

This procedure was rehearsed against local databases in task 06c: migrate, add rows, export, import into a fresh database, compare.

- The export begins with `PRAGMA defer_foreign_keys=TRUE`, so the import does not depend on table order.
- The export includes the `d1_migrations` table, so the new database reports no pending migrations.
- Indexes come across, including the one that stops a masechta being held twice.
- Row counts matched for `campaigns`, `participants` and `claims`.

The remote export and import (steps 6 and 7) have not been run against a real account yet.

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
| Wrangler warns that `secrets` is missing on an environment | `secrets`, `vars` and `d1_databases` are not inherited, so each environment in `wrangler.jsonc` repeats them |
| Smoke test says preview outbox is exposed | Turn Access back on before sharing the address |
| Production refused: mock messaging | Expected until a real provider is added |
| Deploy refused: `REPLACE` value | The account or domain is not chosen yet, so ask the owner to finish "One-time setup" |
| Account listed by `whoami` is not the configured one | Accept the invitation to the project's account, then log in again |

## Not yet exercised

Everything that needs a Cloudflare account is untested until the owner picks one: `pnpm cf:setup` against a real account, `wrangler secret put`, `pnpm deploy:preview`, `pnpm deploy:production`, turning on Cloudflare Access, the Time Travel bookmark and restore, `wrangler rollback`, `wrangler tail`, and the remote export and import in the account move. The decisions those commands depend on are covered by tests in `scripts/`, and the local commands in this document have been run.

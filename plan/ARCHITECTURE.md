# Architecture

## Stack

One Cloudflare Worker serves the API at `/api/*` and the React SPA through Workers Static Assets. Use current stable versions.

- Package manager: pnpm. Language: TypeScript strict.
- Worker: Hono. Database: D1 with Wrangler migrations. Scheduling: Cron Triggers.
- Web: React, Vite with `@cloudflare/vite-plugin`, React Router, TanStack Query, Tailwind.
- Validation: zod schemas in `shared/`, used by both sides.
- Libraries: `@hebcal/core` (Hebrew dates, Yom Tov), `libphonenumber-js` (phones), `qrcode` (QR as SVG).
- Tests: Vitest with `@cloudflare/vitest-plugin` (the renamed `@cloudflare/vitest-pool-workers`) for the Worker, Playwright for the cross-device suite (task 06b).

## Layout

```
migrations/           D1 SQL migrations
shared/               shas.ts, zod schemas, API types (no Worker or DOM imports)
worker/
  index.ts            Hono app plus scheduled handler
  routes/             one file per API group below
  domain/             pure or DB-level rules: claims, reminders, calendar, tokens
  messaging/          MessageSender interface, mock adapter, templates, dispatch
src/                  React app
  routes/  components/  lib/api.ts
e2e/                  Playwright: pages.ts registry, pages.spec.ts, flows/, snapshots
scripts/              deploy.mjs, cf-setup.mjs, e2e-server.mjs; decisions in lib/, with tests
docs/                 DEPLOYING.md, messaging-providers.md, real-device-check.md
```

Routes stay thin: parse with zod, call `domain/`, return JSON. Business rules live in `domain/` so they can be tested directly.

## Schema

Task 03 implements this. IDs are `crypto.randomUUID()` text. Timestamps are ISO-8601 UTC text. Calendar dates are `YYYY-MM-DD` text.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, created_at TEXT NOT NULL
);

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
  consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX login_codes_email ON login_codes(email, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  honoree_name_he TEXT NOT NULL, honoree_name_en TEXT,
  dedication_type TEXT NOT NULL CHECK (dedication_type IN ('ilui_nishmas','refuah_shleima','zechus','other')),
  message TEXT, end_date TEXT NOT NULL, timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  activated_on TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX campaigns_owner ON campaigns(owner_user_id);
CREATE INDEX campaigns_reminders ON campaigns(status, end_date);

CREATE TABLE participants (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0,
  phone TEXT, email TEXT,
  source TEXT NOT NULL CHECK (source IN ('public','organizer')), created_at TEXT NOT NULL
);
CREATE INDEX participants_campaign ON participants(campaign_id);

CREATE TABLE claims (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  masechta_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','completed','released')),
  claimed_at TEXT NOT NULL, completed_at TEXT, released_at TEXT
);
-- The core guarantee: one live holder per masechta per campaign.
CREATE UNIQUE INDEX claims_one_holder ON claims(campaign_id, masechta_id) WHERE status <> 'released';
CREATE INDEX claims_participant ON claims(participant_id);

CREATE TABLE participant_login_codes (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')), address TEXT NOT NULL,
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
  consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX participant_login_codes_address ON participant_login_codes(campaign_id, channel, address, created_at);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL, phone TEXT, email TEXT, invited_at TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX contacts_phone ON contacts(campaign_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX contacts_email ON contacts(campaign_id, email) WHERE email IS NOT NULL;

CREATE TABLE outbound_messages (
  id TEXT PRIMARY KEY, campaign_id TEXT, channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  to_address TEXT NOT NULL, template TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  dedupe_key TEXT UNIQUE, provider_id TEXT, error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);

CREATE TABLE opt_outs (
  channel TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (channel, address)
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL
);
```

Masechtos are not rows. The chart is derived from `shared/shas.ts` plus the campaign's claims, so a campaign costs no rows until someone takes something.

## API contract

JSON everywhere. Errors are `{ "error": { "code": string, "message": string, ...extra } }`.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/request-code` | none | Email a login code |
| `POST /api/auth/verify` | none | Exchange code for session cookie, creating the user if new |
| `POST /api/auth/logout`, `GET /api/auth/me` | session | |
| `GET`, `POST /api/campaigns` | session | Own campaigns |
| `GET`, `PATCH /api/campaigns/:id` | owner | |
| `POST /api/campaigns/:id/activate`, `/archive` | owner | |
| `GET`, `POST /api/campaigns/:id/claims` | owner | All claims with contact details; assign on behalf |
| `PATCH /api/campaigns/:id/claims/:claimId` | owner | Set status |
| `PATCH /api/campaigns/:id/participants/:participantId` | owner | Edit name, phone, email, anonymous setting |
| `GET`, `POST /api/campaigns/:id/contacts` | owner | `POST` takes a batch, returns per-row results |
| `DELETE /api/campaigns/:id/contacts/:contactId` | owner | |
| `POST /api/campaigns/:id/invitations` | owner | |
| `GET /api/public/campaigns/:slug` | none | Campaign and chart state |
| `POST /api/public/campaigns/:slug/claims` | none, rate limited | Take masechtos |
| `POST /api/public/campaigns/:slug/sign-in/request-code` | none, rate limited | Send a code to a phone or email registered in this campaign |
| `POST /api/public/campaigns/:slug/sign-in/verify` | none, rate limited | Exchange a code for a sign-in token |
| `GET /api/manage/:token` | token | Participant's masechtos |
| `POST /api/manage/:token/claims/:claimId/complete`, `/reopen`, `/release` | token | Mark finished, undo that, give back |
| `PATCH /api/manage/:token/participants/:participantId` | token, rate limited | Edit one submission's name, phone, email, anonymous setting |
| `GET`, `DELETE /api/public/campaigns/:slug/mine` | device cookie | This phone's masechtos; forget this phone |
| `GET`, `POST /api/unsubscribe/:token` | token | Show and confirm opt-out |
| `GET /api/dev/outbox`, `POST /api/dev/run-reminders?now=`, `POST /api/dev/seed?scenario=` | non-production | Mock inspection and test data |
| `GET /api/health` | none | `{ ok, environment, commit }`, checked after each deploy |

SPA routes: `/login`, `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/campaigns/:id/sign`, `/c/:slug` (public), `/m/:token` (my portion), `/unsubscribe/:token`, `/dev/outbox`.

## Conventions

**Atomic claiming.** Claim writes go through `env.DB.batch()`, which is one transaction. A violation of `claims_one_holder` rolls back the whole submission, including its participant row. Respond `409` with `error.conflicts` listing the masechtos that were taken.

**Tokens.** A manage token is `<participantId>.<base64url HMAC-SHA256(TOKEN_SECRET, "manage:" + participantId)>`. An unsubscribe token uses the same shape over `"unsub:<channel>:<address>"`, with the channel and address base64url-encoded in the first part. A sign-in token uses the same shape over `"portion:<campaignId>:<channel>:<address>"`, with those three values base64url-encoded in the first part. `/api/manage/:token` and `/m/:token` accept either a manage token, which resolves to one participant, or a sign-in token, which resolves to every participant in that campaign with that address. Verify with constant-time comparison.

**Device memory.** A successful public claim or sign-in adds its token to a cookie named `portion`, set by the server with `Path=/api/public/campaigns/<slug>`, `HttpOnly`, `Secure`, `SameSite=Lax` and a one-year lifetime. The path keeps each campaign separate. It holds the 10 newest tokens. `/mine` verifies each token, ignores any that are invalid or from another campaign, and responds with `Cache-Control: no-store`.

**Secrets.** `TOKEN_SECRET` is a Wrangler secret, with a dev value in `.dev.vars`. Every `/api/*` request answers 500 with code `misconfigured` while it is missing. Session tokens and login codes are stored only as SHA-256 hashes.

**Environment.** `ENVIRONMENT` is `development`, `preview` or `production`. `MESSAGING_MODE` is `mock` for now. `APP_URL` is the site's absolute address, used for every link in a message, because the cron handler has no request to read an origin from. Every `/api/dev/*` route returns 404 in `production`, and `/api/dev/seed` returns 404 everywhere except `development`. `MAINTENANCE_MODE` set to `on` pauses writes and reminders, for moving between Cloudflare accounts. Account-specific values live only in `wrangler.jsonc`. `DEPLOYMENT.md` covers how each environment is set up.

**Public payloads** are built from an explicit allow-list of fields. Phone and email never enter a public or chart response. Anonymous participants appear as `"Anonymous"`, with the real name removed on the server. Personal data stays out of the shared chart payload: `/mine` is a separate request and returns masechtos and manage tokens only.

**Hebrew text** renders with `dir="auto"` or `dir="rtl"` on the element holding it, and the page stays LTR.

**Dates.** Campaign date logic takes `now` as a parameter, so tests control time. Convert to campaign-local dates with `Intl.DateTimeFormat` and the campaign's timezone.

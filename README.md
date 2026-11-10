# Mishnayos campaign app

One shared, live chart for learning all of Shas Mishnayos, usually l'ilui nishmas someone who has passed away. It replaces separate paper charts in different shuls, where nobody can tell whether all of Shas was finished.

The product, architecture and task plan are in [`plan/`](plan/README.md).

## Run it locally

You need Node 22 or newer and pnpm. No Cloudflare account is needed.

```sh
pnpm install
cp .dev.vars.example .dev.vars    # set TOKEN_SECRET to any long random string
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:5173. Nothing is really sent: login codes and every other message appear at http://localhost:5173/dev/outbox.

## Checks

| Command | What it runs |
| --- | --- |
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests for the Worker, shared code and scripts |
| `pnpm test:e2e` | Every page and flow at four device sizes in Chromium |
| `pnpm test:visual` | Screenshot comparison (macOS only) |
| `pnpm test:all` | All of the above tests |

The first `pnpm test:e2e` needs a browser: `pnpm exec playwright install chromium`.

`pnpm test:visual:update` regenerates the screenshots after an intended visual change. Look at the changed images before committing them.

## Trying it out

1. Open http://localhost:5173/login, enter any email, and read the code at http://localhost:5173/dev/outbox.
2. Create a campaign and activate it. Its page has the public link and a printable sign.
3. Open the public link in a private window and take a masechta.

`curl -X POST 'http://localhost:5173/api/dev/seed?scenario=partly-taken'` replaces the local data with a ready-made campaign at http://localhost:5173/c/chart234, owned by `organizer@example.com`. Other scenarios are in `worker/dev/seed.ts`.

Reminders normally run every hour. To see them now, pick a moment and run:
`curl -X POST 'http://localhost:5173/api/dev/run-reminders?now=2030-01-31T15:00:00Z'`

## Where things are

| Folder | What is in it |
| --- | --- |
| `shared/` | The structure of Shas, request schemas and helpers used by both sides |
| `worker/` | The API: `routes/` are thin, the rules live in `domain/`, and every message goes through `messaging/` |
| `src/` | The React app |
| `e2e/` | The device suite: `pages.ts` lists every page and state, `flows/` holds user journeys |
| `migrations/` | Database migrations |
| `scripts/` | Deploy and setup scripts, with their tests |
| `docs/` | Deploying, going live with real messages, and the real-device check |

## Deploying

See [docs/DEPLOYING.md](docs/DEPLOYING.md). `pnpm deploy:check` builds both environments without touching Cloudflare.

## Before real campaigns

- Real text messages and email: [docs/messaging-providers.md](docs/messaging-providers.md). Until then nothing is delivered, and production deploys are refused.
- A Cloudflare account and a permanent domain: [docs/DEPLOYING.md](docs/DEPLOYING.md).
- The check on real phones: [docs/real-device-check.md](docs/real-device-check.md).

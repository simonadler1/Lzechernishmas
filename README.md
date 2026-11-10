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

## Deploying

See [docs/DEPLOYING.md](docs/DEPLOYING.md).

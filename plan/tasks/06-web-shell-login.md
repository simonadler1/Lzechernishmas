# 06: Web shell and login

**Goal:** the SPA foundation: routing, API client, base look, working login, and the dev outbox viewer.

**Read:** `DESIGN.md`, `ARCHITECTURE.md` (SPA routes, Hebrew text).

## Build

- React Router with all routes from `ARCHITECTURE.md`, using simple placeholders for pages not yet built. TanStack Query provider.
- `src/lib/api.ts`: typed fetch wrapper that surfaces the standard error shape.
- Tailwind theme carrying the `DESIGN.md` tokens and fonts, and a small component set built to its phone rules: Button, Input, Field with error, Card, Skeleton, page layout.
- `/login`: enter email, then enter code. `useCurrentUser` hook and a guard that redirects signed-out users from organizer routes.
- `/dev/outbox`: lists messages with channel, recipient, template, status, body. Refreshes itself. This page is how anyone testing the app reads login codes.

## Done when

- Component or Playwright-level check, or a manual browser run noted in `PROGRESS.md`: log in with the code from `/dev/outbox`, land on `/campaigns`, reload and stay logged in, log out and get redirected.
- Layout is usable at 360px wide.

## Out of scope

Campaign screens.

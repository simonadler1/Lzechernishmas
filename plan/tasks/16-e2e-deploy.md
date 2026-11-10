# 16: End-to-end test and launch readiness

**Goal:** prove the product works as a whole, and leave a clear list of what stands between it and real campaigns.

**Read:** `PRODUCT.md` in full, `ARCHITECTURE.md` (Environment, Public payloads).

## Build

A flow in the device suite from task 06b, running on every device project, covering one golden path:

1. Organizer logs in using the code from `/dev/outbox`, creates and activates a campaign, opens the sign page.
2. Organizer pastes contacts and sends invitations.
3. A visitor opens `/c/:slug`, takes a masechta, and opens the my-portion link from the outbox.
4. A second visitor loses a race for a masechta and recovers.
5. Reminders run through the dev route with a chosen `now` and appear in the outbox for the visitors who signed up.
6. The visitor marks the masechta finished, and the organizer sees it.
7. A helper finishes all remaining masechtos, and the siyum state appears.

Documentation:

- `README.md` at the repo root covering local setup and tests, linking to `docs/DEPLOYING.md`.
- `docs/messaging-providers.md`: what is required to go live.
  - How to add an adapter behind `MessageSender`.
  - Email provider and SPF/DKIM.
  - SMS provider and A2P 10DLC registration, inbound STOP webhook writing to `opt_outs`, and messaging-consent review for organizer-supplied contacts.
  - Production must not run with `MESSAGING_MODE=mock`, because login would be impossible.

Audit, recording findings in `PROGRESS.md`:

- Every `/api/campaigns/*` route rejects non-owners, and every `/api/dev/*` route is 404 in production.
- Public and chart responses contain no phone or email.
- Worker fails loudly at request time if `TOKEN_SECRET` is missing.

## Done when

- `pnpm test:all`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm deploy:check` all pass from a clean clone following only the new README.
- `docs/real-device-check.md` exists for the human to run against preview before launch, since the automated suite runs only in Chrome and never exercises iPhone Safari: print a sign, scan it with a real iPhone and a real Android phone, take a masechta on each, confirm the form, keyboard and sticky bar behave, then close the browser, scan the sign again and confirm "Your masechtos" appears.
- The audit list has a recorded result for every item, with anything failing fixed or marked `blocked`.

## Out of scope

Deploying to production, real providers.

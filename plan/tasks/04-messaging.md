# 04: Mock messaging and opt-outs

**Goal:** one path for every outgoing message, mocked behind an interface so real SMS and email are an adapter swap.

**Read:** `PRODUCT.md` (Messaging), `ARCHITECTURE.md` (Tokens, Environment).

## Build

In `worker/messaging/` and `worker/domain/`:

- `MessageSender` interface: `send({ channel, to, subject?, body }) → { providerId } | throws`. A `MockSender` adapter that succeeds and logs. Selection by `MESSAGING_MODE`.
- `dispatch(env, message)`, the only function allowed to call a sender:
  1. If the address has an opt-out and the template is not `login_code` or `participant_code`, record `suppressed` and return.
  2. Insert the `outbound_messages` row as `queued`. When `dedupe_key` already exists, return without sending. Inserting first is what makes retries safe.
  3. Send, then update to `sent` or `failed` with the error.
- `chooseChannel({ phone, email })`: SMS if there is a phone, else email, else none.
- Templates as pure functions, one per event: `login_code`, `participant_code`, `claim_confirmation`, `invitation`, `reminder`, `campaign_complete`. Each returns channel-appropriate `{ subject?, body }`. SMS bodies end with "Reply STOP to opt out" (except `login_code` and `participant_code`) and use the English honoree name when present, because Hebrew characters force short SMS segments. Emails include the unsubscribe URL (except `login_code` and `participant_code`). Every link is built from `APP_URL`.
- `worker/domain/tokens.ts`: sign and verify manage, sign-in and unsubscribe tokens as specified.
- `worker/domain/phone.ts`: normalize to E.164 with `libphonenumber-js`, default region IL when the campaign timezone is `Asia/Jerusalem`, otherwise US. Email normalization: trim and lowercase.
- Routes: `GET /api/dev/outbox` (newest first, 404 in production), `GET` and `POST /api/unsubscribe/:token`.

## Done when

Tests prove:

- A sent message is recorded with status `sent`.
- An opted-out address is `suppressed` and the sender is never called, while `login_code` and `participant_code` still go through.
- Two dispatches with one `dedupe_key` call the sender once.
- A throwing sender records `failed`.
- Tokens round-trip, and a tampered token is rejected.
- Phones: `(718) 555-0123` under US and `054-555-0123` under IL normalize correctly, and garbage is rejected.
- `/api/dev/outbox` is 404 when `ENVIRONMENT` is `production`.

## Out of scope

Real providers, inbound STOP webhooks, the outbox and unsubscribe pages in the UI.

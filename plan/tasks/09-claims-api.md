# 09: Public chart and claiming API

**Goal:** the heart of the product: anyone with the link can take masechtos, no masechta is ever double-held, and finishing all of Shas is detected.

**Read:** `PRODUCT.md` (The chart, Taking a masechta, My portion page), `ARCHITECTURE.md` (Atomic claiming, Tokens, Public payloads).

## Build

- `GET /api/public/campaigns/:slug`: campaign public fields, progress, and an array of non-open masechtos `{ masechtaId, status: 'taken' | 'finished', name }`. Open masechtos are implied by absence. Draft and archived campaigns return 404.
- `POST /api/public/campaigns/:slug/claims`: body `{ name, phone?, email?, isAnonymous?, masechtaIds: string[] }`.
  - Requires an active campaign, a name, and 1 to 10 valid masechtos. Phone and email are optional, and rejected only when supplied and invalid.
  - Rate limit 10 submissions per IP per hour.
  - One `DB.batch()` inserts the participant and all claims. On unique-index violation return 409 with `conflicts`.
  - On success return the manage token, add it to the device cookie, and dispatch `claim_confirmation` when a phone or email was given.
- `POST /api/public/campaigns/:slug/sign-in/request-code`: body `{ address }`, a phone or email. Normalize it, and only if a participant in this campaign has that address, store a hashed code and dispatch `participant_code` to it on the matching channel. Always returns the same response. Limit 5 per address and 20 per IP per hour with `checkRateLimit`. Draft and archived campaigns return 404.
- `POST /api/public/campaigns/:slug/sign-in/verify`: body `{ address, code }`. Same rules as organizer codes (task 05), sharing that code logic: 10-minute expiry, single use, lock after 5 wrong attempts. On success return a sign-in token and add it to the device cookie.
- `GET /api/manage/:token`, and `/complete` and `/release` per claim, each confirming the claim belongs to a participant the token resolves to. The `GET` includes each submission's name, phone, email and anonymous setting for the edit form.
- `PATCH /api/manage/:token/participants/:participantId`: body `{ name, phone?, email?, isAnonymous }`, confirming the participant is one the token resolves to. Uses the claim form's validation and a shared `updateParticipant` in `worker/domain/participants.ts`. Rate limit 10 per IP per hour. Dispatch `claim_confirmation` to a phone or email that was added or changed. If the edit removes the address a sign-in token is built on, return that participant's manage token so the page can switch to it and the person is not locked out.
- `GET /api/public/campaigns/:slug/mine`: returns `{ submissions: [{ manageToken, masechtos: [{ masechtaId, status }] }] }` for the device cookie, one entry per participant with live claims, deduplicated. Empty when there is no cookie. `DELETE` clears the cookie.
- Shared `setClaimStatus` in `worker/domain/claims.ts`. After any status change it runs campaign-completion logic: all 63 masechtos `completed` moves the campaign to `completed` and dispatches `campaign_complete` once (dedupe key per campaign). Reverting moves it back to `active`.

## Done when

Tests prove:

- **Race:** 20 concurrent submissions for one masechta produce exactly one success and 19 409s, with no orphan participants.
- A two-masechta submission where one is taken creates nothing and names the conflict.
- A submission with no name is rejected, and so is one with an invalid phone or email.
- A name-only submission succeeds, returns a working manage token, and creates no outbound message.
- The public response contains no phone or email anywhere (assert on the serialized JSON), and anonymous names are replaced server-side.
- A manage token cannot act on another participant's claim.
- A released masechta can be retaken.
- Finishing the final masechta completes the campaign and notifies once. Undoing returns it to `active`.
- Sign-in `request-code` responds identically for matched and unmatched addresses, and sends nothing for an unmatched one.
- Full sign-in flow, reading the code out of `outbound_messages`: the token lists masechtos from two separate submissions with one phone number, and can complete and release both.
- A sign-in token cannot act on a claim belonging to a different address, or on another campaign.
- Wrong, expired and reused codes and lockout after 5 attempts all fail, and the rate limit returns 429 past the limit.
- A code issued in one campaign does not work in another.
- Editing: a new name shows on the chart, turning on anonymous hides it, and a blank name or invalid phone is rejected.
- Editing a participant the token does not resolve to is rejected.
- Adding or changing a phone or email sends one `claim_confirmation`, and saving unchanged details sends none.
- A name-only participant who adds a phone can then sign in with it.
- With a sign-in token over a phone shared by two submissions, editing one leaves the other unchanged.
- Changing the address a sign-in token is built on returns a working manage token.
- Device memory: a claim sets the cookie with the specified attributes, a second claim in the same browser adds to it, and `/mine` returns both.
- `/mine` is empty without a cookie, ignores a tampered token or one from another campaign, leaves out released claims, and contains no phone or email (assert on the serialized JSON). `DELETE` clears it.

## Out of scope

UI, organizer assignment routes (task 12).

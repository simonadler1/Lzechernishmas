# 13: Contacts, invitations, unsubscribe

**Goal:** organizers supply phones and emails and invite those people. Anyone can opt out.

**Read:** `PRODUCT.md` (Contacts and invitations, Messaging).

## Build

API:

- Contacts `GET`, batch `POST`, `DELETE`. `POST` parses and normalizes each row, returning a per-row result of `added`, `duplicate` or `invalid` with a reason. Valid rows persist even when others fail.
- `POST /api/campaigns/:id/invitations`: body `{ contactIds? , confirmedExpectation: true }`. Omitting `contactIds` means all uninvited. Campaign must be active. Uses `chooseChannel`, dedupe key `invite:<campaignId>:<contactId>`, sets `invited_at`.

A shared parser in `shared/` turns a pasted line into `{ name, phone?, email? }`: name first, then phone and email detected by shape in either order.

UI, a Contacts section on `/campaigns/:id`:

- Add one, or paste many, with a per-line results report.
- Table with name, phone, email, invited status, and whether they have taken a masechta.
- "Send invitations" with the confirmation checkbox from `PRODUCT.md` and a count of recipients.

`/unsubscribe/:token` page: states what will stop, one confirm button, and a done state. It uses the routes from task 04.

## Done when

Tests prove:

- Mixed paste input (valid, invalid phone, duplicate, email-only) gives the right per-row results.
- Re-sending invitations does not message anyone twice.
- A contact with both phone and email gets SMS only.
- Opted-out contacts are recorded as `suppressed`.
- Sending without `confirmedExpectation` is rejected.
- Browser run noted in `PROGRESS.md`: paste contacts, send invitations, follow the unsubscribe link from a message in `/dev/outbox`.

## Out of scope

CSV file upload, address-book import.

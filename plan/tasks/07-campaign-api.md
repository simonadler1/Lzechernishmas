# 07: Campaign API

**Goal:** organizers can create, edit, activate and archive their campaigns.

**Read:** `PRODUCT.md` (Campaign), `ARCHITECTURE.md` (Schema, API contract).

## Build

- Zod schemas in `shared/` for create and update.
- Routes: list, create, get, patch, activate, archive, owner-scoped through `requireCampaignOwner`.
- Slug: 8 characters from a URL-safe alphabet without look-alikes (`0/O`, `1/l/I`), retry on collision.
- Validation: `end_date` is a real date after today in the campaign's timezone at activation. `timezone` is a valid IANA zone. Hebrew honoree name required.
- Activation sets `activated_on` to today's campaign-local date.
- List and get include progress counts (`finished`, `taken`, `open`, `total`) via a reusable `getProgress(env, campaign)` in `worker/domain/`, which task 09 also uses.

## Done when

Tests prove:

- Create, read, update, activate, archive happy paths.
- Another user's campaign is 404 on every route.
- Bad dates and bad timezones are rejected.
- Editing `end_date` after activation is allowed.
- The progress total is 63, and released claims count as open.

## Out of scope

Claims, contacts, UI.

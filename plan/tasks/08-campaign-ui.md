# 08: Campaign create and list UI

**Goal:** an organizer can create a campaign, see their campaigns, and activate one.

**Read:** `PRODUCT.md` (Campaign).

## Build

- `/campaigns`: cards with title, honoree, end date, status, progress bar.
- `/campaigns/new`: form with all campaign fields. Timezone defaults to the browser's. The end date shows the Hebrew date beside it using `@hebcal/core`, updating as the date changes. Honoree input is RTL.
- `/campaigns/:id`: a basic details page with edit, activate, archive, and the public link with a copy button. Task 12 expands this page, so structure it around sections that can be added to.

## Done when

- Browser run noted in `PROGRESS.md`: create a campaign, see the Hebrew date update, activate it, copy its public link.
- Validation errors from the API appear on the relevant fields.
- A test confirms the Hebrew date helper for two known dates.
- Usable at 360px wide.

## Out of scope

Chart display, claims table, contacts, QR.

# 11: My portion page

**Goal:** participants can see and finish what they took, from a private link.

**Read:** `PRODUCT.md` (My portion page).

## Build

`/m/:token`:

- Campaign honoree and target date, and the person's masechtos. The token can be a manage token (one submission) or a sign-in token (every submission with that phone or email in the campaign). The page behaves the same for both.
- For each masechta: a "Read on Sefaria" link using `sefariaUrl`, a "Mark finished" button, and an undo for finished ones. "Give it back" requires a confirmation step inside the page, not a browser dialog.
- "Edit my details" for each submission: name, phone, email and the anonymous toggle, with the same labels and messaging notice as the claim form. When the token covers more than one submission, group masechtos by submission, each with its own edit action. If the response returns a new token, replace the URL with `/m/:token` for it.
- A link to take more at `/c/:slug`.
- A friendly invalid-link state.
- An encouraging completion state once all their masechtos are finished.

This page is linked from messages, so its `<meta name="robots">` is `noindex`.

## Done when

- Browser run noted in `PROGRESS.md`: open the link from `/dev/outbox`, finish a masechta, and see it marked finished on `/c/:slug`. Give one back and see it open again.
- A tampered token shows the invalid state.
- Browser run noted in `PROGRESS.md`: open a name-only submission, add a phone number, see the link in `/dev/outbox`, change the name, and see the new name on `/c/:slug`.
- `/m/:token` is registered in the device suite with the edit form open, and with one token covering two submissions.

## Out of scope

Swapping masechtos in one step. Giving one back and taking another covers it.

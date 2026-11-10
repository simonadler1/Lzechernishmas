# 10: Public chart page

**Goal:** the page people reach from the QR code. On a phone in shul, someone can take a masechta in under a minute.

**Read:** `DESIGN.md`, `PRODUCT.md` (The problem, The chart, Taking a masechta).

## Build

`/c/:slug`:

- Header: honoree name large in Hebrew, dedication, target date in English and Hebrew, the Shas map from `DESIGN.md`, and counts in the "41 of 63 masechtos finished, 12 taken, 10 still open" form.
- Chart: sections by seder, each with a list of its masechtos. Each row shows the name in Hebrew and English, the number of perakim, its state, and the holder's name when taken, using the state patterns from `DESIGN.md`.
- Filter: "show only what's still open".
- Selection: tap open masechtos. A sticky bottom bar shows the selection and continues to a short form: name (required), optional phone and email with a line saying that leaving both blank means no reminders, anonymous toggle, and the messaging notice when a contact is entered.
- Confirmation: lists what was taken, and prominently links to `/m/:token`. For someone who left no contact, add a copy-link button and a note that this phone will remember them, but that on any other phone the link is the only way back.
- On 409: keep the form values, drop the conflicted masechtos from the selection, name them, and refresh the chart.
- "Your masechtos": when `/mine` returns anything, show it above the chart with each masechta's status, a link to `/m/:token` per submission, and a "Not you? Remove from this phone" action that calls `DELETE /mine`. Render nothing while loading or when empty, so a first-time visitor's page does not shift.
- Chart refreshes every 30 seconds and on window focus.
- States for not found, `completed` (siyum message), and past the target date.
- "Already took a masechta? Sign in" form: enter the phone or email given, then the 6-digit code on the next step, using `inputmode="numeric"` and `autocomplete="one-time-code"`. On success, go to `/m/:token` with the returned token.

## Done when

- Browser run at 360px noted in `PROGRESS.md`: take one masechta with a phone number, take several at once, see confirmation, see the message in `/dev/outbox`. Then take one with only a name, and see the save-your-link note with nothing added to the outbox. Then sign in with the phone number, using the code from `/dev/outbox`, and land on that person's masechtos.
- With two browsers, the second to submit the same masechta sees the conflict handling, with its form intact.
- `/c/:slug` is registered in the device suite in its `partly-taken`, `completed` and `long-names` states and passes on all projects, including the 200 KB budget.
- A flow on every device project takes a masechta from a fresh page load, using only the public link.
- `/c/:slug` is also registered with "Your masechtos" showing, using the registry's setup step to take a masechta first.
- A flow takes a masechta, reloads `/c/:slug`, sees "Your masechtos", follows its link to `/m/:token`, returns, and removes it with "Not you?".

## Out of scope

The `/m/:token` page.

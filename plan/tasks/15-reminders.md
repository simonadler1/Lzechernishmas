# 15: Reminder engine

**Goal:** the 14-day and 7-day reminders reach the people who signed up, on time, once each, and never on Shabbos or Yom Tov.

**Read:** `PRODUCT.md` (Reminders), `ARCHITECTURE.md` (Dates).

## Build

`worker/domain/calendar.ts`:

- `isHeldDate(localDate, inIsrael)`: Saturday, or a `flags.CHAG` day from `@hebcal/core` for that calendar. Chol Hamoed and fast days are permitted.
- `isIsrael` is true when the campaign timezone is `Asia/Jerusalem`.

`worker/domain/reminders.ts`, a pure function plus a runner:

- `dueReminderKinds(campaign, nowUtc)` returns which of `T14`, `T7` are due now. For each kind:
  - `target = end_date - N days`. Skip if `target < activated_on`.
  - `sendDate` = first non-held date on or after `target`. Skip if `sendDate >= end_date`.
  - Due when local today is on or after `sendDate`, before `end_date`, not held, and local hour is in `[10, 20)`. The "on or after" lets a run recover from a missed cron.
- Runner, called by the `scheduled` handler and `POST /api/dev/run-reminders?now=`:
  - Selects `active` campaigns with `end_date` in the next 15 days.
  - Recipients are participants with at least one masechta still `claimed`. Group by address, so a person with several submissions gets one message listing all their masechtos and links.
  - Participants with no phone or email are skipped.
  - Dedupe key: `reminder:<campaignId>:<endDate>:<kind>:<channel>:<address>`.
  - Sends at most 200 messages per run. The dedupe keys let the next hourly run continue where it stopped.
  - One campaign's failure is logged and does not stop the others.

## Done when

Tests with a fixed `now` prove:

- T14 and T7 each fire at 10:00 local and not at 09:00.
- A target on Shabbos fires Sunday. A target on a Yom Tov moves past the whole Yom Tov, including when it runs into Shabbos.
- A second-day-Yom-Tov date is held for a diaspora campaign and permitted for an Israel campaign (take the dates from hebcal in the test).
- Timezones: the same UTC instant is due for a New York campaign and not for a Jerusalem one.
- Activation at 10 days before the end sends T7 only. At 5 days, sends neither.
- Repeat runs send nothing new. Moving the end date allows a new cycle.
- Audience: a participant with an unfinished masechta gets a reminder, one who has finished everything gets nothing, a participant with no phone or email is skipped without error, contacts who never signed up and the organizer get nothing, and opted-out addresses are suppressed.
- The 200-message cap holds, and a second run finishes the rest.

Then, as a manual check noted in `PROGRESS.md`: call `/api/dev/run-reminders` with a chosen `now` and read the result in `/dev/outbox`.

## Out of scope

Organizer-configurable reminder schedules.

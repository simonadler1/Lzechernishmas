# Product spec

## The problem

Families hang mishnayos charts in several shuls. Each chart is its own island, so the same masechta gets taken twice, others get missed, and nobody knows if Shas was finished. This app makes one live chart per campaign, reachable from anywhere by link or QR code.

Audience and tone: often a family in aveilus, and shul-goers scanning a sign on their phone. Keep the UI quiet, respectful and uncluttered. Phone-first on public pages.

## People

- **Organizer**: has an account, creates and runs campaigns.
- **Participant**: takes one or more masechtos. Has no account and no password.
- **Contact**: someone the organizer supplied (name, phone and/or email) to invite. Becomes a participant only by taking a masechta.

## Campaign

Fields: title, honoree name in Hebrew (for example נפתלי בן יעקב), optional honoree name in English, dedication type (ilui nishmas, refuah shleima, zechus, other), optional message, end date, timezone.

The end date picker shows the matching Hebrew date, since these campaigns usually target a shloshim or yahrzeit.

Lifecycle: `draft` → `active` → `completed`, and `archived` from any state. Only an active campaign accepts claims. Reaching the end date changes nothing automatically: claims stay open and the page reads "past the target date", because the goal is still to finish.

## The chart

A campaign covers all of Shas: 6 sedarim, 63 masechtos.

The unit of claiming is the **masechta**. One person can take several, and each masechta shows its number of perakim so people can judge its size.

Each masechta is **open**, **taken** or **finished**. The headline answer on the public page is the one paper charts cannot give: "41 of 63 masechtos finished, 12 taken, 10 still open."

A masechta can never be held by two people. If someone loses a race for a masechta, tell them which ones were just taken and leave their form filled in.

## Taking a masechta (public page, no login)

1. Scan the QR code or open the link. See honoree, dedication, progress, and the chart grouped by seder.
2. Pick masechtos. Enter a name, which is the only required field. Phone and email are optional, and the form says that leaving both blank means no reminders. Optionally appear as "Anonymous" on the chart; the organizer still sees the name. When a phone or email is entered, a short notice states they will get reminders for this campaign and can opt out.
3. See a confirmation with a link to their personal "my portion" page. People who left a phone or email also receive the link by message. People who left neither are told that this phone will remember them, but that on any other phone the link is the only way back, so they should save it. The organizer can still mark their masechta finished for them.

Privacy: public pages show only display names. Phone numbers and emails appear only to that campaign's organizer and to the person on their own my portion page.

## My portion page (private link, no login)

Shows the person's masechtos with a link to read each on Sefaria. They can mark each finished or give it back.

They can also edit their name, phone, email and whether they appear as Anonymous. Name stays required, and phone and email stay optional. Each submission is edited on its own, because two people can share a phone number. Adding or changing a phone or email sends the my portion link to it, which also lets someone who gave only a name turn on reminders and sign-in.

## Signing back in (public page, no account)

Anyone who gave a phone or email can get back to their masechtos without the link. A "Sign in" form on the public page asks for that phone or email and sends a 6-digit code to it. Entering the code opens the my portion page, showing every masechta taken with that phone or email in this campaign, including across separate submissions. The form responds identically whether or not the address matched. Codes expire after 10 minutes, are single-use, and lock after 5 wrong attempts. Someone who gave only a name cannot sign in until a phone or email is added.

## Coming back on the same phone

After someone takes a masechta or signs in, their phone remembers them for this campaign. When they scan the same QR code again, the public page shows "Your masechtos" above the chart, with a link to manage them. Nothing has to be saved or typed. A "Not you? Remove from this phone" action clears it, for borrowed or shared phones. This does not carry over to another phone or survive clearing browser data, so those cases use sign-in or the organizer.

## Organizer dashboard

Progress, plus a table of every claim with name, contact details, status and date. The organizer can:

- assign a masechta on someone's behalf, with contact details optional, for people without a phone or for copying over an existing paper chart,
- mark any claim finished, undo that, or release it,
- edit a participant's name, phone, email and anonymous setting, for people who gave only a name and lost their link,
- edit campaign details, including the end date.

When every masechta is finished the campaign becomes `completed`, the public page shows a siyum message, and the organizer is notified. Undoing a finished masechta returns it to `active`.

## Contacts and invitations

Organizers add contacts by form or by pasting a list (one per line: name, phone, email, in any order after the name). Phones are normalized to E.164 and invalid rows are reported per line, while valid rows still import.

Before the first invitation the organizer confirms these are people who would expect to hear from them about this campaign. Invitations go out on request, to all uninvited contacts or a selection.

## Messaging

SMS and email are **mocked** for now: every message is recorded in an outbox viewable in development. Nothing is delivered. The code must let real providers drop in by adding an adapter.

Each person gets one message per event: SMS if there is a phone number, otherwise email.

| Event | Recipient |
| --- | --- |
| Login code | Organizer (email) |
| Claim confirmation with my-portion link, also sent when a phone or email is added or changed | Participant |
| Invitation with campaign link | Contact |
| Sign-in code | Participant (to the phone or email they entered) |
| Reminder at 14 and 7 days before end | Participant (see below) |
| Campaign completed | Organizer |

Every non-login message offers an opt-out: an unsubscribe link in email, "Reply STOP" in SMS. Opted-out addresses are skipped across the whole app.

## Reminders

Sent 14 days and 7 days before the end date, at about 10:00 in the campaign's timezone, to participants with at least one unfinished masechta. The message lists their remaining masechtos and includes their my-portion link. Participants with no phone or email are skipped.

Rules:

- No message goes out on Shabbos or Yom Tov. A reminder landing on one moves to the next permitted day. Israel campaigns follow the Israeli Yom Tov calendar.
- A reminder whose date passed before the campaign was activated is skipped. A campaign activated 10 days out gets only the 7-day reminder.
- A reminder that would fall on or after the end date is skipped.
- Each person gets each reminder once. Moving the end date starts a new reminder cycle.

## QR sign

The organizer can print a sign for any active campaign: Letter or A4, one page, with honoree name, dedication, end date, a large QR code to the public page, the short URL in text for people who cannot scan, and a line explaining this is the single shared chart for the campaign.

## Out of scope for this plan

Real SMS and email delivery, inbound STOP webhook handling, payments, a full Hebrew UI (Hebrew appears in masechta and honoree names), partial-Shas campaigns, co-organizers, claiming by perek or mishnah.

# 12: Organizer dashboard

**Goal:** the organizer can see who has what and correct the chart.

**Read:** `PRODUCT.md` (Organizer dashboard), `ARCHITECTURE.md` (API contract).

## Build

API:

- `GET /api/campaigns/:id/claims`: all live claims joined with participant name, phone, email, real name even if anonymous, in Shas order.
- `POST /api/campaigns/:id/claims`: assign masechtos to a named person, contact details optional, no 10-masechta cap. Same atomicity and 409 behaviour as public claiming. Participant `source` is `organizer`. If contact details are given, dispatch `claim_confirmation`.
- `PATCH /api/campaigns/:id/claims/:claimId`: status changes through `setClaimStatus`.
- `PATCH /api/campaigns/:id/participants/:participantId`: edits name, phone, email and anonymous setting through `updateParticipant` from task 09. Dispatch `claim_confirmation` to a phone or email that was added or changed.

UI, extending `/campaigns/:id`:

- Progress summary, and a list of the masechtos still open.
- Claims table, filterable by status and searchable by name, stacking into cards on narrow screens.
- Row actions: mark finished, undo, release, edit details. Release uses an in-page confirmation.
- "Assign masechtos": a picker that shows only open masechtos and allows several at once, so a paper chart can be copied over quickly.

## Done when

- Tests prove: non-owners get 404, including on the edit route, a participant from another campaign gets 404, organizer assignment conflicts return 409, and marking the final masechta finished through this route completes the campaign.
- Tests prove: adding a phone to a name-only participant sends them the my-portion link.
- Browser run noted in `PROGRESS.md`: assign a masechta without contact details, see it on the public chart, mark it finished, release another.

## Out of scope

Contacts, invitations.

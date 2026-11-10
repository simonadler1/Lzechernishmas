# 05: Organizer auth API

**Goal:** passwordless organizer login by emailed 6-digit code, with cookie sessions.

**Read:** `ARCHITECTURE.md` (API contract, Secrets).

## Build

- `POST /api/auth/request-code`: generate a code with `crypto.getRandomValues`, store its hash, dispatch `login_code`. Always returns the same success response. Limit 5 per email and 20 per IP per hour using the `rate_limits` table, through a reusable `checkRateLimit(env, key, limit, windowSeconds)`.
- `POST /api/auth/verify`: codes expire after 10 minutes, are single-use, and lock after 5 wrong attempts. On success create the user if new, create a 30-day session, and set an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- `POST /api/auth/logout`, `GET /api/auth/me`.
- Middleware: `requireUser`, and `requireCampaignOwner` (used from task 07), which returns 404 for campaigns the user does not own so existence is not revealed.

## Done when

Tests prove:

- The full login flow, reading the code out of `outbound_messages` in the test.
- Wrong code, expired code, reused code, and lockout after 5 attempts all fail.
- Rate limit returns 429 past the limit.
- Unknown and known emails get an identical `request-code` response.
- `/api/auth/me` is 401 without a session and after logout.

## Out of scope

Login UI (task 06).

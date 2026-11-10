# 03: Database and test harness

**Goal:** the full schema as migrations, and a Worker test setup where each test gets a clean migrated D1.

**Read:** `ARCHITECTURE.md` (Schema).

## Build

- `migrations/0001_initial.sql` containing the schema exactly as specified.
- Test setup applying migrations through `applyD1Migrations` with isolated storage per test.
- `worker/test-utils.ts` with small factories: `createUser`, `createCampaign`, `createParticipant`, `createClaim`.

## Done when

- `pnpm db:migrate:local` applies cleanly to a fresh local database.
- Tests prove the guarantee in `claims_one_holder`:
  - Two live claims on one masechta in one campaign fail.
  - The same masechta in a different campaign succeeds.
  - A released claim frees the masechta for a new claim.
  - A `completed` claim still blocks a new claim.
  - A `db.batch()` containing one conflicting insert leaves no rows from that batch.

## Out of scope

Repositories or query helpers beyond the test factories. Each feature task writes the queries it needs.

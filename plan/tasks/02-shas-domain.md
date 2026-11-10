# 02: Shas domain module

**Goal:** one typed source of truth for the structure of Shas.

**Read:** `plan/reference/shas.json`, `PRODUCT.md` (The chart).

## Build

`shared/shas.ts`, importing or embedding the JSON, exporting types and:

- `SHAS`: sedarim in order, each with masechtos in order.
- `ALL_MASECHTOS`: a flat ordered list, and `TOTAL_MASECHTOS`.
- `getMasechta(id)` and `isValidMasechta(id)`.
- `sefariaUrl(masechtaId)`: for example `https://www.sefaria.org/Mishnah_Berakhot`.

## Done when

Tests prove:

- 6 sedarim and `TOTAL_MASECHTOS === 63`.
- Masechta ids are unique, and `getMasechta('taharos')` returns the masechta even though a seder has the same id.
- An unknown masechta is rejected.
- `sefariaUrl` output is correct for an ordinary masechta and for Avos (which uses `Pirkei_Avot`).

## Out of scope

Anything that reads claims or the database.

# 14: Printable QR sign

**Goal:** the organizer prints a sign that hangs in any shul and points to the one shared chart.

**Read:** `PRODUCT.md` (QR sign).

## Build

`/campaigns/:id/sign`, linked from the campaign page and owner-only:

- On-screen preview with a Letter or A4 choice and a Print button.
- Print layout using `@media print` and `@page`: exactly one page, app chrome hidden. Honoree name is the largest element, in Hebrew. Includes dedication, target date in English and Hebrew, a large QR code (at least 3 inches across), the URL in plain text, and the line about this being the single shared chart.
- QR as inline SVG from `qrcode` with error correction level M, encoding the absolute `/c/:slug` URL.
- The page tells the organizer when the campaign is not active, since the QR would lead nowhere.

Print-friendly means black on white with no background fills.

## Done when

- A test generates the QR and decodes it (for example with `jsqr` on a rasterized render) back to the exact public URL.
- `page.pdf()` in Playwright, or a browser print preview noted in `PROGRESS.md`, shows exactly one page for both Letter and A4, including a long Hebrew name.
- The QR opens the public page from a real or emulated phone scan on a LAN-reachable dev server, or the decode test stands in with a note in `PROGRESS.md`.

## Out of scope

Per-shul tracking codes, custom sign designs.

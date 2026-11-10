# 06b: Cross-device test suite

**Goal:** one command proves every page works and looks right on phones and desktop, and each later task extends it by adding a line.

**Read:** `DESIGN.md`, `ARCHITECTURE.md` (Environment).

## Build

**Devices.** Playwright projects, all running every test in Chromium:

| Project | Viewport |
| --- | --- |
| `iphone` | iPhone 14 device preset, with `defaultBrowserType: 'chromium'` |
| `android` | Pixel 7 device preset |
| `small-phone` | 360 x 640, touch enabled |
| `desktop` | 1440 x 900 |

The tests run against a production build served by Wrangler with a local D1 in a throwaway directory, so they exercise what ships.

**Seed scenarios.** `POST /api/dev/seed?scenario=<name>` resets the test database and loads named data with fixed IDs and slugs, returning 404 unless `ENVIRONMENT` is `development`. Start with `empty`. Later tasks add scenarios as tables gain data. Task 10 needs at least `partly-taken`, `completed`, and `long-names` (a very long Hebrew honoree name and long participant names).

**Page registry.** `e2e/pages.ts` lists each page: path, seed scenario, whether login is required, and an optional setup step. `e2e/pages.spec.ts` loops over the registry and runs these checks at every device:

- `expectHealthyLayout`: no horizontal scroll, no element overflowing the viewport.
- Tap targets of at least 44px on phone projects, exempting links inside running text.
- Form inputs have a computed font size of at least 16px on phone projects.
- Accessibility scan with `@axe-core/playwright`, failing on serious and critical issues.
- No console errors and no failed requests.
- Visual snapshot with `toHaveScreenshot`, full page, after `document.fonts.ready`, with a frozen clock and animations disabled.

**Flows.** `e2e/flows/*.spec.ts` holds user journeys, starting with login. Use accessible locators (`getByRole`, `getByLabel`) and `tap()` on phone projects.

**Weight budget.** A test records JavaScript transferred on the public entry path. Task 10 registers `/c/:slug` with a limit of 200 KB gzipped, which depends on route-level code splitting so organizer-only code and the QR library stay out of it.

**Snapshots.** Baselines are generated in Chromium on the owner's Mac and committed. Font rendering differs by operating system, so they are valid only on macOS. On any other OS, `test:visual` and `test:visual:update` exit successfully after printing that snapshots were skipped. Use a small `maxDiffPixelRatio` (about 0.01) to absorb minor rendering noise.

Scripts:

- `test:e2e`: functional, layout and accessibility checks, with snapshots skipped.
- `test:visual`: snapshot comparison.
- `test:visual:update`: regenerate baselines.
- `test:all`: unit tests, `test:e2e`, then `test:visual`.

Add `.github/workflows/test.yml` running typecheck, lint, unit tests and `test:e2e`, uploading the report on failure.

## Done when

- `/login` and `/dev/outbox` are registered and pass on all four projects.
- The login flow passes on all four projects.
- Each check is shown to go *red*: temporarily add a page with a too-wide element, a 30px button and a 14px input, confirm the matching checks fail, then remove it.
- Changing a color makes `test:visual` fail, and reverting makes it pass.
- `/api/dev/seed` is 404 when `ENVIRONMENT` is `preview` or `production`.

If the agent is not on macOS, finish everything else, and record in `PROGRESS.md` that baselines still need generating on the Mac.

## Out of scope

Real-device testing (task 16), pages not yet built.

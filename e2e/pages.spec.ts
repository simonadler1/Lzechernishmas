import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import {
  expectAccessible,
  expectHealthyLayout,
  expectReadableInputs,
  expectTapTargets,
  watchForErrors,
} from './checks';
import { FROZEN_NOW, isPhone, loginByApi, seed, settle } from './helpers';
import { BUDGETS, PAGES } from './pages';

for (const entry of PAGES) {
  test(`page: ${entry.name}`, async ({ page }, testInfo) => {
    await seed(page, entry.scenario);
    if (entry.login) await loginByApi(page);
    if (entry.before) await entry.before(page);

    await page.clock.setFixedTime(FROZEN_NOW);
    const errors = watchForErrors(page);
    await page.goto(entry.path);
    await settle(page);
    if (entry.setup) {
      await entry.setup(page);
      await settle(page);
    }

    // Soft checks, so one run reports everything wrong with a page.
    await test.step('layout', () => expectHealthyLayout(page));
    if (isPhone(testInfo)) {
      await test.step('tap targets', () => expectTapTargets(page));
      await test.step('input text size', () => expectReadableInputs(page));
    }
    await test.step('accessibility', () => expectAccessible(page));
    await test.step('no errors', async () => errors.expectNone());

    if (process.env.VISUAL) {
      await test.step('screenshot', () =>
        expect(page).toHaveScreenshot(`${entry.name}.png`, {
          fullPage: true,
          mask: [page.locator('[data-volatile]')],
        }),
      );
    }
  });
}

for (const budget of BUDGETS) {
  test(`weight: ${budget.name} stays under ${budget.maxGzipKb} KB of JavaScript`, async ({ page }) => {
    await seed(page, budget.scenario);
    const scripts: Promise<number>[] = [];
    page.on('response', (res) => {
      if (res.request().resourceType() !== 'script') return;
      // The local server may not compress, so gzip each file here to get the size a visitor downloads.
      scripts.push(
        res
          .body()
          .then((body) => gzipSync(body).length)
          .catch(() => 0),
      );
    });
    await page.goto(budget.path);
    await settle(page);
    const total = (await Promise.all(scripts)).reduce((sum, n) => sum + n, 0);
    test.info().annotations.push({ type: 'js-gzip-kb', description: (total / 1024).toFixed(1) });
    expect(total, 'no JavaScript was seen').toBeGreaterThan(0);
    expect(total / 1024, `${budget.path} JavaScript, gzipped KB`).toBeLessThanOrEqual(budget.maxGzipKb);
  });
}

import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { loginByApi, press, seed } from '../helpers';

/** Counts the pages of a PDF made by the browser. */
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;

for (const scenario of ['partly-taken', 'long-names']) {
  test(`the sign prints on exactly one page, Letter and A4 (${scenario})`, async ({ page }, testInfo) => {
    await seed(page, scenario);
    await loginByApi(page);
    await page.goto('/campaigns/seed-active');
    await press(page.getByRole('link', { name: 'Printable sign with QR code' }), testInfo);
    await expect(page.getByRole('heading', { name: 'Printable sign' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const paper of ['Letter', 'A4']) {
      await page.getByLabel(paper).check();
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(pageCount(pdf), `${paper} pages`).toBe(1);
    }

    // On paper the code is at least 3 inches across, not counting its blank border.
    // A4 is the narrower page: 698 pixels of printable width at 96 pixels per inch.
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 698, height: 1026 });
    const image = page.getByRole('img', { name: /^QR code/ });
    const box = await image.boundingBox();
    const modules = Number((await image.getAttribute('viewBox'))!.split(' ')[2]);
    const darkInches = ((box!.width / 96) * (modules - 8)) / modules;
    expect(darkInches).toBeGreaterThanOrEqual(3);
    // Nothing spills out of the sheet.
    const overflow = await page.getByTestId('sign-sheet').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('the QR code on the sign scans to the public chart', async ({ page, baseURL }) => {
  await seed(page, 'partly-taken');
  await loginByApi(page);
  await page.goto('/campaigns/seed-active/sign');
  const shot = PNG.sync.read(await page.getByRole('img', { name: /^QR code/ }).screenshot());
  const decoded = jsQR(new Uint8ClampedArray(shot.data), shot.width, shot.height);
  expect(decoded?.data).toBe(`${baseURL}/c/chart234`);

  // Following what the code says opens the chart.
  await page.goto(decoded!.data);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('נפתלי בן יעקב');
});

import { expect, test, type Page } from '@playwright/test';
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

/** Checks the sign as it prints: one page on both papers, nothing spilling out of the sheet. */
async function expectOnePage(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  for (const [paper, width, height] of [['Letter', 720, 960], ['A4', 698, 1026]] as const) {
    // The paper choice is hidden on paper, so pick it on screen and then switch to print.
    // `null` returns to normal behaviour, where a PDF uses print styles. Forcing 'screen' would print the controls.
    await page.emulateMedia({ media: null });
    await page.getByLabel(paper).check();
    expect(pageCount(await page.pdf({ preferCSSPageSize: true })), `${paper} pages`).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width, height });
    const overflow = await page.getByTestId('sign-sheet').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow, `${paper} overflow`).toBeLessThanOrEqual(1);
    // The code and the closing line are always whole.
    const sheet = (await page.getByTestId('sign-sheet').boundingBox())!;
    const closing = (await page.getByText(/This is the one shared chart/).boundingBox())!;
    expect(closing.y + closing.height, `${paper} closing line`).toBeLessThanOrEqual(sheet.y + sheet.height + 1);
  }
  await page.emulateMedia({ media: null });
}

const fullyShown = (page: Page) =>
  page.getByTestId('sign-message').evaluate((el) => {
    const block = el.parentElement!;
    return el.getBoundingClientRect().bottom <= block.getBoundingClientRect().bottom + 1;
  });

test('the organizer’s free text prints on the sign, shrinking to stay on one page', async ({ page }) => {
  await seed(page, 'partly-taken');
  await loginByApi(page);
  const setMessage = async (message: string) => {
    const saved = await page.request.patch('/api/campaigns/seed-active', { data: { message } });
    expect(saved.ok()).toBe(true);
    await page.goto('/campaigns/seed-active/sign');
    await expect(page.getByTestId('sign-message')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  };
  const size = () => page.getByTestId('sign-message').evaluate((el) => (el as HTMLElement).style.fontSize);

  // A short note prints at the largest size, with its line breaks kept.
  await setMessage('Shiva is at 12 Maple Avenue until Thursday morning.\nShacharis 7:00, Mincha 4:30.');
  await expect(page.getByTestId('sign-message')).toContainText('Shacharis 7:00');
  expect(await size()).toBe('3cqw');
  expect(await fullyShown(page)).toBe(true);
  await expectOnePage(page);

  // The longest text the form allows is set smaller and still prints in full.
  const longest = ('Shiva is at 12 Maple Avenue until Thursday morning. Shacharis 7:00, Mincha 4:30.\n' +
    'נא לסיים עד השלושים. הסיום יתקיים אי״ה בבית הכנסת אחרי מעריב.\n' +
    'Please mark your masechta finished on the chart so the family knows. '.repeat(20)).slice(0, 1000);
  await setMessage(longest);
  expect(await size()).not.toBe('3cqw');
  expect(await fullyShown(page)).toBe(true);
  await expect(page.getByText(/too long for the sign/)).toHaveCount(0);
  await expectOnePage(page);
});

test('text too long for a sign with a very long name is cut off, and the organizer is told', async ({ page }) => {
  await seed(page, 'long-names');
  await loginByApi(page);
  await page.goto('/campaigns/seed-active/sign');
  // The seeded text fits.
  await expect(page.getByTestId('sign-message')).toContainText('Please finish by the yahrzeit');
  expect(await fullyShown(page)).toBe(true);
  await expect(page.getByText(/too long for the sign/)).toHaveCount(0);

  const saved = await page.request.patch('/api/campaigns/seed-active', {
    data: { message: 'Please mark your masechta finished on the chart so the family knows.\n'.repeat(14).slice(0, 1000) },
  });
  expect(saved.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText(/too long for the sign, so its end is cut off/)).toBeVisible();
  await expectOnePage(page);
});

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

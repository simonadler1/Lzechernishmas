import { expect, test } from '@playwright/test';
import { lastCodeFor, lastMessageTo, linkPath, outbox, press, seed } from '../helpers';

const CHART = '/c/chart234';

test('a visitor takes masechtos from the public link, with and without a phone number', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  await page.goto(CHART);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('נפתלי בן יעקב');
  await expect(page.getByText('14 of 63 masechtos finished, 11 taken, 38 still open')).toBeVisible();

  // One masechta, with a phone number.
  await press(page.getByRole('button', { name: /Kilayim/ }), testInfo);
  await expect(page.getByText('1 selected')).toBeVisible();
  await press(page.getByRole('button', { name: 'Continue' }), testInfo);
  await page.getByLabel('Your name', { exact: true }).fill('Shlomo Adler');
  await page.getByLabel('Phone (optional)').fill('718-555-0142');
  await expect(page.getByText(/You will get a link to your page and reminders/)).toBeVisible();
  await press(page.getByRole('button', { name: 'Take this masechta' }), testInfo);

  await expect(page.getByRole('heading', { name: 'Taken' })).toBeVisible();
  await expect(page.getByText(/You took Kilayim/)).toBeVisible();
  await expect(page.getByText(/We also sent you this link/)).toBeVisible();
  const message = await lastMessageTo(page, '+17185550142', 'claim_confirmation');
  expect(message.body).toContain('Kilayim');
  const sentLink = linkPath(message, '/m/');
  await expect(page.getByRole('link', { name: 'Open your page' })).toHaveAttribute('href', sentLink);

  // Several at once. The form remembers the name.
  await press(page.getByRole('button', { name: 'Back to the chart' }), testInfo);
  await expect(page.getByText('14 of 63 masechtos finished, 12 taken, 37 still open')).toBeVisible();
  await press(page.getByRole('button', { name: /Sheviis/ }), testInfo);
  await press(page.getByRole('button', { name: /Terumos/ }), testInfo);
  await press(page.getByRole('button', { name: /Maasros/ }), testInfo);
  await expect(page.getByText('3 selected')).toBeVisible();
  await press(page.getByRole('button', { name: 'Continue' }), testInfo);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Shlomo Adler');
  await press(page.getByRole('button', { name: 'Take these masechtos' }), testInfo);
  await expect(page.getByText(/You took Sheviis, Terumos and Maasros/)).toBeVisible();

  // With only a name: a save-your-link note, and nothing sent.
  const sentBefore = (await outbox(page)).length;
  await press(page.getByRole('button', { name: 'Back to the chart' }), testInfo);
  await press(page.getByRole('button', { name: /Challah/ }), testInfo);
  await press(page.getByRole('button', { name: 'Continue' }), testInfo);
  await page.getByLabel('Your name', { exact: true }).fill('Name Only');
  await page.getByLabel('Phone (optional)').fill('');
  await expect(page.getByText(/Leaving both blank means no reminders/)).toBeVisible();
  await press(page.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(page.getByText(/This phone will remember you. On any other phone, this link is the only way back/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy the link' })).toBeVisible();
  expect((await outbox(page)).length).toBe(sentBefore);

  // The chart shows all of it.
  await press(page.getByRole('button', { name: 'Back to the chart' }), testInfo);
  await expect(page.getByText('14 of 63 masechtos finished, 16 taken, 33 still open')).toBeVisible();
});

test('a visitor signs back in with the code sent to their phone', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  await page.goto(CHART);
  await press(page.getByRole('button', { name: 'Already took a masechta? Sign in' }), testInfo);
  await page.getByLabel('Phone or email').fill('(718) 555-0101');
  await press(page.getByRole('button', { name: 'Send code' }), testInfo);

  await page.getByLabel('6-digit code').fill('000000');
  await press(page.getByRole('button', { name: 'Sign in' }), testInfo);
  await expect(page.getByText(/code is not right/)).toBeVisible();

  await page.getByLabel('6-digit code').fill(await lastCodeFor(page, '+17185550101'));
  await press(page.getByRole('button', { name: 'Sign in' }), testInfo);
  await expect(page).toHaveURL(/\/m\/.+/);
});

test('the second of two visitors to take a masechta keeps their form and is told what happened', async ({ browser, page }, testInfo) => {
  await seed(page, 'partly-taken');
  const other = await browser.newContext({ ...testInfo.project.use });
  const second = await other.newPage();

  await page.goto(CHART);
  await second.goto(CHART);
  for (const visitor of [page, second]) {
    await press(visitor.getByRole('button', { name: /Kilayim/ }), testInfo);
    await press(visitor.getByRole('button', { name: /Orlah/ }), testInfo);
    await press(visitor.getByRole('button', { name: 'Continue' }), testInfo);
  }

  await page.getByLabel('Your name', { exact: true }).fill('First Visitor');
  await press(page.getByRole('button', { name: 'Take these masechtos' }), testInfo);
  await expect(page.getByRole('heading', { name: 'Taken' })).toBeVisible();

  await second.getByLabel('Your name', { exact: true }).fill('Second Visitor');
  await second.getByLabel('Email (optional)').fill('second@example.com');
  await press(second.getByRole('button', { name: 'Take these masechtos' }), testInfo);

  // Both were taken, so the second visitor is back at the chart with the reason.
  await expect(second.getByText('Someone just took Kilayim and Orlah. Please choose another.')).toBeVisible();
  await expect(second.getByText('First Visitor').first()).toBeVisible();

  // Choosing again brings back the form with what they typed.
  await press(second.getByRole('button', { name: /Bikkurim/ }), testInfo);
  await press(second.getByRole('button', { name: 'Continue' }), testInfo);
  await expect(second.getByLabel('Your name', { exact: true })).toHaveValue('Second Visitor');
  await expect(second.getByLabel('Email (optional)')).toHaveValue('second@example.com');
  await press(second.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(second.getByText(/You took Bikkurim/)).toBeVisible();
  await other.close();
});

test('a partial conflict keeps the form open with the remaining masechta', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  await page.goto(CHART);
  await press(page.getByRole('button', { name: /Kilayim/ }), testInfo);
  await press(page.getByRole('button', { name: /Orlah/ }), testInfo);
  await press(page.getByRole('button', { name: 'Continue' }), testInfo);
  await page.getByLabel('Your name', { exact: true }).fill('Slow Typer');

  // Someone else takes one of the two while the form is open.
  const res = await page.request.post('/api/public/campaigns/chart234/claims', {
    data: { name: 'Quick Person', masechtaIds: ['kilayim'] },
    headers: { 'cf-connecting-ip': '203.0.113.77' },
  });
  expect(res.ok()).toBe(true);

  await press(page.getByRole('button', { name: 'Take these masechtos' }), testInfo);
  await expect(page.getByText('Someone just took Kilayim. Your other choices are still selected.')).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Slow Typer');
  await press(page.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(page.getByText(/You took Orlah/)).toBeVisible();
});

test('the same phone is remembered, and can be told to forget', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  await page.goto(CHART);
  await expect(page.getByRole('heading', { name: 'Your masechtos' })).toHaveCount(0);

  await press(page.getByRole('button', { name: /Kilayim/ }), testInfo);
  await press(page.getByRole('button', { name: 'Continue' }), testInfo);
  await page.getByLabel('Your name', { exact: true }).fill('Name Only');
  await press(page.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(page.getByRole('heading', { name: 'Taken' })).toBeVisible();

  // Scanning the sign again is a fresh load of the same link.
  await page.goto(CHART);
  await expect(page.getByRole('heading', { name: 'Your masechtos' })).toBeVisible();
  const yours = page.getByRole('region', { name: 'Your masechtos' });
  await expect(yours.getByText('Kilayim')).toBeVisible();

  await press(yours.getByRole('link', { name: 'Mark finished or give back' }), testInfo);
  await expect(page).toHaveURL(/\/m\/.+/);
  await page.goBack();

  await press(page.getByRole('button', { name: 'Not you? Remove from this phone' }), testInfo);
  await expect(page.getByRole('heading', { name: 'Your masechtos' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/masechtos finished/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your masechtos' })).toHaveCount(0);
});

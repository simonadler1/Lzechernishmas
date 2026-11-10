import { expect, test } from '@playwright/test';
import { hebrewDate } from '../../shared/hebrew-date';
import { loginByApi, press, seed } from '../helpers';

test('an organizer creates a campaign, activates it and copies its link', async ({ page, context }, testInfo) => {
  await seed(page, 'organizer');
  await loginByApi(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/campaigns');
  await press(page.getByRole('link', { name: 'Start a campaign' }), testInfo);
  await expect(page).toHaveURL(/\/campaigns\/new$/);

  // An empty form comes back with a message on each field that needs one.
  await press(page.getByRole('button', { name: 'Create campaign' }), testInfo);
  await expect(page.getByText('Enter the name in Hebrew.')).toBeVisible();
  await expect(page.getByText('Give the campaign a title.')).toBeVisible();
  await expect(page.getByText('Choose a real date.')).toBeVisible();

  await page.getByLabel('Name in Hebrew').fill('נפתלי בן יעקב');
  await page.getByLabel('Name in English (optional)').fill('Naftali ben Yaakov');
  await page.getByLabel('Campaign title').fill('Mishnayos for the shloshim');

  // The Hebrew date follows the date as it changes.
  await page.getByLabel('Target date').fill('2031-03-15');
  await expect(page.getByTestId('hebrew-date')).toHaveText(hebrewDate('2031-03-15')!);
  await page.getByLabel('Target date').fill('2031-03-20');
  await expect(page.getByTestId('hebrew-date')).toHaveText(hebrewDate('2031-03-20')!);

  // The timezone starts as the browser's.
  await expect(page.getByLabel('Timezone')).toHaveValue('America/New_York');

  await press(page.getByRole('button', { name: 'Create campaign' }), testInfo);
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Activate the campaign to get its link')).toBeVisible();

  await press(page.getByRole('button', { name: 'Activate campaign' }), testInfo);
  await expect(page.getByText('The chart is open.')).toBeVisible();

  const link = await page.getByTestId('public-link').innerText();
  expect(link).toMatch(/\/c\/[a-z2-9]{8}$/);
  await press(page.getByRole('button', { name: 'Copy link' }), testInfo);
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // It is on the list now.
  await press(page.getByRole('link', { name: 'Your campaigns' }), testInfo);
  await expect(page.getByRole('link', { name: /Mishnayos for the shloshim/ })).toBeVisible();
});

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
  await expect(page.getByText('Enter the name.')).toBeVisible();
  await expect(page.getByText('Choose a real date.')).toBeVisible();

  // The name is typed with the on-screen Hebrew keyboard, as someone without one would.
  const name = page.getByLabel('Name', { exact: true });
  await press(page.getByRole('button', { name: 'Type in Hebrew letters' }), testInfo);
  const keyboard = page.getByRole('group', { name: 'Hebrew keyboard' });
  const tapKeys = async (keys: string[]) => {
    for (const key of keys) await press(keyboard.getByRole('button', { name: key, exact: true }), testInfo);
  };
  await tapKeys([...'נפתלי', 'Space', ...'בן', 'Space', ...'יעקבב', 'Delete']);
  await expect(name).toHaveValue('נפתלי בן יעקב');

  // Typing in the middle works: put the cursor after the first word and add to it.
  await name.focus();
  await name.evaluate((input: HTMLInputElement) => input.setSelectionRange(5, 5));
  await name.dispatchEvent('select');
  await tapKeys(['Space', ...'צבי']);
  await expect(name).toHaveValue('נפתלי צבי בן יעקב');
  await press(page.getByRole('button', { name: 'Hide the Hebrew keyboard' }), testInfo);
  await expect(keyboard).toHaveCount(0);

  // The Hebrew date follows the date as it changes.
  await page.getByLabel('Target date').fill('2031-03-15');
  await expect(page.getByTestId('hebrew-date')).toHaveText(hebrewDate('2031-03-15')!);
  await page.getByLabel('Target date').fill('2031-03-20');
  await expect(page.getByTestId('hebrew-date')).toHaveText(hebrewDate('2031-03-20')!);

  // Nobody is asked for a timezone.
  await expect(page.getByLabel('Timezone')).toHaveCount(0);

  await press(page.getByRole('button', { name: 'Create campaign' }), testInfo);
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Activate the campaign to get its link')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("L'ilui nishmas: נפתלי צבי בן יעקב");

  // The browser's timezone was saved with the campaign without being asked for.
  const saved = (await (await page.request.get(`/api/campaigns/${page.url().split('/').pop()}`)).json()) as {
    campaign: { timezone: string };
  };
  expect(saved.campaign.timezone).toBe('America/New_York');

  await press(page.getByRole('button', { name: 'Activate campaign' }), testInfo);
  await expect(page.getByText('The chart is open.')).toBeVisible();

  const link = await page.getByTestId('public-link').innerText();
  expect(link).toMatch(/\/c\/[a-z2-9]{8}$/);
  await press(page.getByRole('button', { name: 'Copy link' }), testInfo);
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // It is on the list now.
  await press(page.getByRole('link', { name: 'Your campaigns' }), testInfo);
  await expect(page.getByRole('link', { name: /L'ilui nishmas: / })).toBeVisible();
});

test('a name typed in English is shown as typed, everywhere', async ({ page }, testInfo) => {
  await seed(page, 'organizer');
  await loginByApi(page);
  await page.goto('/campaigns/new');
  await page.getByLabel('Name', { exact: true }).fill('Sarah bas Avraham');
  await page.getByLabel('The learning is').selectOption('refuah_shleima');
  await page.getByLabel('Target date').fill('2031-03-15');
  await press(page.getByRole('button', { name: 'Create campaign' }), testInfo);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refuah shleima: Sarah bas Avraham');
  await press(page.getByRole('button', { name: 'Activate campaign' }), testInfo);

  const chart = new URL(await page.getByTestId('public-link').innerText()).pathname;
  await press(page.getByRole('link', { name: 'Printable sign with QR code' }), testInfo);
  await expect(page.getByTestId('sign-sheet').getByRole('heading', { name: 'Sarah bas Avraham' })).toBeVisible();

  await page.goto(chart);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sarah bas Avraham');
  await expect(page.getByText('All of Shas Mishnayos, learned for a refuah shleima for')).toBeVisible();
});

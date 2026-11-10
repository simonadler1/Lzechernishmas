import { expect, test } from '@playwright/test';
import { lastMessageTo, loginByApi, press, seed } from '../helpers';

test('an organizer assigns, finishes, edits and releases masechtos', async ({ page, context }, testInfo) => {
  await seed(page, 'partly-taken');
  await loginByApi(page);
  await page.goto('/campaigns/seed-active');
  await expect(page.getByText('14 of 63 masechtos finished, 11 taken, 38 still open')).toBeVisible();

  // Assign two masechtos to someone with no contact details.
  await press(page.getByRole('button', { name: 'Assign masechtos' }), testInfo);
  await page.getByLabel('Their name').fill('Zeidy Cohen');
  await page.getByLabel('Kilayim').check();
  await page.getByLabel('Orlah').check();
  await press(page.getByRole('button', { name: 'Assign 2 masechtos' }), testInfo);
  await expect(page.getByText('Assigned Kilayim, Orlah to Zeidy Cohen.')).toBeVisible();
  await expect(page.getByText('14 of 63 masechtos finished, 13 taken, 36 still open')).toBeVisible();

  // It shows on the public chart.
  const chart = await context.newPage();
  await chart.goto('/c/chart234');
  await expect(chart.getByRole('listitem').filter({ hasText: 'Kilayim' }).getByText('Zeidy Cohen')).toBeVisible();

  // Mark it finished for them.
  const kilayim = page.getByTestId('claim-kilayim');
  await expect(kilayim.getByText('Added by you')).toBeVisible();
  await press(kilayim.getByRole('button', { name: 'Mark finished' }), testInfo);
  await expect(kilayim.getByRole('button', { name: 'Undo finished' })).toBeVisible();
  await expect(page.getByText('15 of 63 masechtos finished, 12 taken, 36 still open')).toBeVisible();

  // Release another, after the in-page confirmation.
  const orlah = page.getByTestId('claim-orlah');
  await press(orlah.getByRole('button', { name: 'Release' }), testInfo);
  await expect(orlah.getByText(/Release Orlah from Zeidy Cohen\?/)).toBeVisible();
  await press(orlah.getByRole('button', { name: 'Release Orlah' }), testInfo);
  await expect(page.getByTestId('claim-orlah')).toHaveCount(0);

  await chart.reload();
  await expect(chart.getByRole('listitem').filter({ hasText: 'Kilayim' }).getByText('Zeidy Cohen, finished')).toBeVisible();
  await expect(chart.getByRole('button', { name: /Orlah/ })).toBeVisible();
  await chart.close();

  // Add a phone for a name-only person: they are sent their link.
  const zevachim = page.getByTestId('claim-zevachim');
  await press(zevachim.getByRole('button', { name: 'Edit details' }), testInfo);
  await page.getByLabel('Phone (optional)').fill('718-555-0166');
  await press(page.getByRole('button', { name: 'Save details' }), testInfo);
  await expect(zevachim.getByText('+17185550166')).toBeVisible();
  expect((await lastMessageTo(page, '+17185550166', 'claim_confirmation')).body).toContain('/m/');

  // Search and filter.
  await page.getByLabel('Search by name').fill('kaplan');
  await expect(page.getByText('Showing 4 of 26')).toBeVisible();
  await page.getByLabel('Show', { exact: true }).selectOption('taken');
  await expect(page.getByText('Showing 1 of 26')).toBeVisible();
  await expect(page.getByTestId('claim-keilim')).toBeVisible();
});

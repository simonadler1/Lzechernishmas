import { expect, test } from '@playwright/test';
import { lastMessageTo, linkPath, outbox, press, seed } from '../helpers';
import { manageToken } from '../tokens';

const CHART = '/c/chart234';

test('a participant opens the link from their message, finishes one masechta and gives another back', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');

  // Take two masechtos with a phone number, then follow the link that was sent.
  const res = await page.request.post('/api/public/campaigns/chart234/claims', {
    data: { name: 'Shlomo Adler', phone: '718-555-0142', masechtaIds: ['kilayim', 'orlah'] },
  });
  expect(res.ok()).toBe(true);
  const link = linkPath(await lastMessageTo(page, '+17185550142', 'claim_confirmation'), '/m/');

  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('נפתלי בן יעקב');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const kilayim = page.getByRole('listitem').filter({ hasText: 'Kilayim' });
  const orlah = page.getByRole('listitem').filter({ hasText: 'Orlah' });
  await expect(kilayim.getByRole('link', { name: 'Read on Sefaria' })).toHaveAttribute(
    'href',
    'https://www.sefaria.org/Mishnah_Kilayim',
  );

  await press(kilayim.getByRole('button', { name: 'Mark finished' }), testInfo);
  await expect(kilayim.getByText('9 perakim, finished')).toBeVisible();
  await expect(kilayim.getByRole('button', { name: 'Undo finished' })).toBeVisible();

  // Giving back asks first, inside the page.
  await press(orlah.getByRole('button', { name: 'Give it back' }), testInfo);
  await expect(orlah.getByText('Give back Orlah?')).toBeVisible();
  await press(orlah.getByRole('button', { name: 'Keep it' }), testInfo);
  await press(orlah.getByRole('button', { name: 'Give it back' }), testInfo);
  await press(orlah.getByRole('button', { name: 'Give it back' }), testInfo);
  await expect(orlah).toHaveCount(0);

  // The shared chart shows both changes.
  await press(page.getByRole('link', { name: 'Take more masechtos' }), testInfo);
  await expect(page).toHaveURL(CHART);
  await expect(page.getByRole('listitem').filter({ hasText: 'Kilayim' }).getByText('Shlomo Adler, finished')).toBeVisible();
  await expect(page.getByRole('button', { name: /Orlah/ })).toBeVisible();

  // Undo works too.
  await page.goto(link);
  await press(page.getByRole('button', { name: 'Undo finished' }), testInfo);
  await expect(page.getByRole('button', { name: 'Mark finished' })).toBeVisible();
});

test('a name-only participant adds a phone number and changes their name', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  // Binyamin Stern (p8) gave only a name.
  const token = manageToken('seed-active-p8');
  await page.goto(`/m/${token}`);
  await expect(page.getByText('No phone or email, so no reminders')).toBeVisible();
  const before = (await outbox(page)).length;

  await press(page.getByRole('button', { name: 'Edit my details' }), testInfo);
  await page.getByLabel('Phone (optional)').fill('not a number');
  await press(page.getByRole('button', { name: 'Save details' }), testInfo);
  await expect(page.getByText(/This phone number does not look right/)).toBeVisible();

  await page.getByLabel('Phone (optional)').fill('(718) 555-0155');
  await press(page.getByRole('button', { name: 'Save details' }), testInfo);
  await expect(page.getByText('+17185550155')).toBeVisible();

  // The link is sent to the new number.
  const message = await lastMessageTo(page, '+17185550155', 'claim_confirmation');
  expect(linkPath(message, '/m/')).toBe(`/m/${token}`);
  expect((await outbox(page)).length).toBe(before + 1);

  await press(page.getByRole('button', { name: 'Edit my details' }), testInfo);
  await page.getByLabel('Your name', { exact: true }).fill('Binyamin Tzvi Stern');
  await press(page.getByRole('button', { name: 'Save details' }), testInfo);
  await expect(page.getByRole('heading', { name: 'Binyamin Tzvi Stern' })).toBeVisible();
  expect((await outbox(page)).length).toBe(before + 1);

  await page.goto(CHART);
  await expect(page.getByText('Binyamin Tzvi Stern').first()).toBeVisible();
});

test('a tampered link shows the invalid state', async ({ page }) => {
  await seed(page, 'partly-taken');
  await page.goto(`/m/${manageToken('seed-active-p1').replace('.', '.x')}`);
  await expect(page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { press, seed } from '../helpers';

test('an organizer logs in with the code from the test outbox, and logs out', async ({ page, context }, testInfo) => {
  await seed(page, 'empty');
  const email = 'new-organizer@example.com';

  await page.goto('/campaigns');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel('Email').fill(email);
  await press(page.getByRole('button', { name: 'Send code' }), testInfo);
  await expect(page.getByLabel('6-digit code')).toBeVisible();

  // Read the code the way a tester does.
  const outbox = await context.newPage();
  await outbox.goto('/dev/outbox');
  const message = outbox.getByRole('listitem').filter({ hasText: email }).first();
  await expect(message).toBeVisible();
  const code = (await message.innerText()).match(/\b\d{6}\b/)?.[0] ?? '';
  await outbox.close();

  await page.getByLabel('6-digit code').fill('000000' === code ? '111111' : '000000');
  await press(page.getByRole('button', { name: 'Log in' }), testInfo);
  await expect(page.getByText(/code is not right/)).toBeVisible();

  await page.getByLabel('6-digit code').fill(code);
  await press(page.getByRole('button', { name: 'Log in' }), testInfo);
  await expect(page).toHaveURL(/\/campaigns$/);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();

  await press(page.getByRole('button', { name: 'Log out' }), testInfo);
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/campaigns');
  await expect(page).toHaveURL(/\/login/);
});

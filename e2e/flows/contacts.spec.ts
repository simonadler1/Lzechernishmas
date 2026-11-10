import { expect, test } from '@playwright/test';
import { lastMessageTo, linkPath, loginByApi, outbox, press, seed } from '../helpers';

test('an organizer pastes contacts, invites them, and a contact unsubscribes', async ({ page }, testInfo) => {
  await seed(page, 'partly-taken');
  await loginByApi(page);
  await page.goto('/campaigns/seed-active');

  await press(page.getByRole('button', { name: 'Paste a list instead' }), testInfo);
  await page
    .getByLabel('Paste contacts')
    .fill(['Yaakov Stein, 718-555-0171, yaakov@example.com', 'No Details Here', 'Leah Marcus leah@example.com'].join('\n'));
  await press(page.getByRole('button', { name: 'Add contacts' }), testInfo);
  await expect(page.getByText('2 of 3 added.')).toBeVisible();
  await expect(page.getByText('Line 2 (No Details Here): Not added. No phone number or email.')).toBeVisible();
  // Only the line that needs fixing is left in the box.
  await expect(page.getByLabel('Paste contacts')).toHaveValue('No Details Here');

  const contacts = page.getByRole('list', { name: 'Contacts' });
  await expect(contacts.getByText('+17185550171')).toBeVisible();
  await expect(contacts.getByRole('listitem').filter({ hasText: 'Moshe Katz' }).getByText('Took a masechta')).toBeVisible();

  // Four people are waiting: two seeded, two just added.
  const send = page.getByRole('button', { name: 'Send 4 invitations' });
  await expect(send).toBeDisabled();
  await page.getByLabel('These are people who would expect to hear from me about this campaign').check();
  await press(send, testInfo);
  await expect(page.getByText('4 invitations sent.')).toBeVisible();
  await expect(page.getByText('Everyone on the list has been invited.')).toBeVisible();

  // Phone wins over email, and nobody already invited was messaged again.
  const invitations = (await outbox(page)).filter((m) => m.template === 'invitation');
  expect(invitations.map((m) => m.to).sort()).toEqual(
    ['+17185550112', '+17185550171', 'leah@example.com', 'shira@example.com'].sort(),
  );

  // A contact follows the unsubscribe link in their email.
  const message = await lastMessageTo(page, 'leah@example.com', 'invitation');
  expect(linkPath(message, '/c/')).toBe('/c/chart234');
  await page.goto(linkPath(message, '/unsubscribe/'));
  await expect(page.getByRole('heading', { name: 'Stop emails?' })).toBeVisible();
  await expect(page.getByText('leah@example.com')).toBeVisible();
  await press(page.getByRole('button', { name: 'Stop these emails' }), testInfo);
  await expect(page.getByRole('heading', { name: 'Stopped' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stopped' })).toBeVisible();
});

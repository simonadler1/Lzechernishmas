import { expect, test, type Page } from '@playwright/test';
import { addDays, localDate } from '../../shared/dates';
import { readFileSync } from 'node:fs';
import { lastMessageTo, linkPath, outbox, press, seed } from '../helpers';

// Read as a file: Playwright's loader does not take the JSON import that shared/shas.ts uses.
const ALL_MASECHTA_IDS = (
  JSON.parse(readFileSync('shared/shas.json', 'utf8')) as { masechtos: { id: string }[] }[]
).flatMap((seder) => seder.masechtos.map((m) => m.id));

/** Finds the first weekday 10:00 New York time, on or after a date, that is not Shabbos or Yom Tov for the app. */
async function reminderMoment(page: Page, from: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const day = addDays(from, i);
    // 15:00 UTC is 10:00 or 11:00 in New York, inside the sending window either way.
    const now = `${day}T15:00:00Z`;
    const res = await page.request.post(`/api/dev/run-reminders?now=${now}`);
    const run = (await res.json()) as { campaigns: number };
    if (run.campaigns > 0) return now;
  }
  throw new Error('No permitted reminder day found');
}

test('the whole product: from a new organizer to the siyum', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await seed(page, 'empty');
  const organizerEmail = 'family@example.com';
  const today = localDate(new Date(), 'America/New_York');
  const endDate = addDays(today, 16);

  // 1. The organizer logs in with the code from the outbox, creates and activates a campaign, opens the sign.
  await page.goto('/login');
  await page.getByLabel('Email').fill(organizerEmail);
  await press(page.getByRole('button', { name: 'Send code' }), testInfo);
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  const code = (await lastMessageTo(page, organizerEmail, 'login_code')).body.match(/\b\d{6}\b/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await press(page.getByRole('button', { name: 'Log in' }), testInfo);

  await press(page.getByRole('link', { name: 'Start a campaign' }), testInfo);
  await page.getByLabel('Name in Hebrew').fill('חיה בת דוד');
  await page.getByLabel('Name in English (optional)').fill('Chaya bas Dovid');
  await page.getByLabel('Campaign title').fill('Mishnayos for Bubby');
  await page.getByLabel('Target date').fill(endDate);
  await page.getByLabel('Timezone').selectOption('America/New_York');
  await press(page.getByRole('button', { name: 'Create campaign' }), testInfo);
  await press(page.getByRole('button', { name: 'Activate campaign' }), testInfo);
  await expect(page.getByText('The chart is open.')).toBeVisible();
  const campaignUrl = page.url();
  const chartPath = new URL(await page.getByTestId('public-link').innerText()).pathname;

  await press(page.getByRole('link', { name: 'Printable sign with QR code' }), testInfo);
  await expect(page.getByRole('img', { name: /^QR code/ })).toBeVisible();
  await expect(page.getByTestId('sign-sheet').getByText('חיה בת דוד')).toBeVisible();
  await press(page.getByRole('link', { name: 'Back to the campaign' }), testInfo);

  // 2. The organizer pastes contacts and sends invitations.
  await press(page.getByRole('button', { name: 'Paste a list instead' }), testInfo);
  await page.getByLabel('Paste contacts').fill('Shlomo Adler, 718-555-0142\nRivka Klein, rivka@example.com');
  await press(page.getByRole('button', { name: 'Add contacts' }), testInfo);
  await expect(page.getByText('2 of 2 added.')).toBeVisible();
  await page.getByLabel('These are people who would expect to hear from me about this campaign').check();
  await press(page.getByRole('button', { name: 'Send 2 invitations' }), testInfo);
  await expect(page.getByText('2 invitations sent.')).toBeVisible();
  const invitation = await lastMessageTo(page, '+17185550142', 'invitation');
  expect(linkPath(invitation, '/c/')).toBe(chartPath);

  // 3. A visitor follows the invitation, takes a masechta, and opens their page from the message.
  const visitorContext = await browser.newContext({ ...testInfo.project.use });
  const visitor = await visitorContext.newPage();
  await visitor.goto(chartPath);
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('חיה בת דוד');
  await press(visitor.getByRole('button', { name: /Berachos/ }), testInfo);
  await press(visitor.getByRole('button', { name: /Peah/ }), testInfo);
  await press(visitor.getByRole('button', { name: 'Continue' }), testInfo);
  await visitor.getByLabel('Your name', { exact: true }).fill('Shlomo Adler');
  await visitor.getByLabel('Phone (optional)').fill('718-555-0142');
  await press(visitor.getByRole('button', { name: 'Take these masechtos' }), testInfo);
  await expect(visitor.getByRole('heading', { name: 'Taken' })).toBeVisible();
  const portionPath = linkPath(await lastMessageTo(visitor, '+17185550142', 'claim_confirmation'), '/m/');

  // 4. A second visitor loses a race for a masechta and recovers.
  const secondContext = await browser.newContext({ ...testInfo.project.use });
  const second = await secondContext.newPage();
  await second.goto(chartPath);
  await press(second.getByRole('button', { name: /Demai/ }), testInfo);
  await press(second.getByRole('button', { name: /Kilayim/ }), testInfo);
  await press(second.getByRole('button', { name: 'Continue' }), testInfo);
  await second.getByLabel('Your name', { exact: true }).fill('Rivka Klein');
  await second.getByLabel('Email (optional)').fill('rivka@example.com');
  // Meanwhile the first visitor takes Demai too.
  await visitor.goto(chartPath);
  await press(visitor.getByRole('button', { name: /Demai/ }), testInfo);
  await press(visitor.getByRole('button', { name: 'Continue' }), testInfo);
  await visitor.getByLabel('Your name', { exact: true }).fill('Shlomo Adler');
  await visitor.getByLabel('Phone (optional)').fill('718-555-0142');
  await press(visitor.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(visitor.getByText(/You took Demai/)).toBeVisible();

  await press(second.getByRole('button', { name: 'Take these masechtos' }), testInfo);
  await expect(second.getByText('Someone just took Demai. Your other choices are still selected.')).toBeVisible();
  await expect(second.getByLabel('Your name', { exact: true })).toHaveValue('Rivka Klein');
  await press(second.getByRole('button', { name: 'Take this masechta' }), testInfo);
  await expect(second.getByText(/You took Kilayim/)).toBeVisible();

  // 5. Reminders run with a chosen time and reach the people who signed up, and nobody else.
  const before = (await outbox(page)).filter((m) => m.template === 'reminder').length;
  expect(before).toBe(0);
  await reminderMoment(page, addDays(endDate, -14));
  const reminders = (await outbox(page)).filter((m) => m.template === 'reminder');
  expect(reminders.map((m) => m.to).sort()).toEqual(['+17185550142', 'rivka@example.com']);
  const mine = reminders.find((m) => m.to === '+17185550142')!;
  expect(mine.body).toContain('Berachos, Peah and Demai');
  expect(mine.body).toContain(portionPath);

  // 6. The visitor marks a masechta finished from their page, and the organizer sees it.
  await visitor.goto(portionPath);
  await press(
    visitor.getByRole('listitem').filter({ hasText: 'Berachos' }).getByRole('button', { name: 'Mark finished' }),
    testInfo,
  );
  await expect(visitor.getByText('9 perakim, finished')).toBeVisible();
  await page.goto(campaignUrl);
  const berachos = page.getByTestId('claim-berachos');
  await expect(berachos.getByText('Shlomo Adler')).toBeVisible();
  await expect(berachos.getByRole('button', { name: 'Undo finished' })).toBeVisible();
  await expect(page.getByText('1 of 63 masechtos finished, 3 taken, 59 still open')).toBeVisible();

  // 7. A helper finishes everything that is left, and the siyum appears.
  const campaignId = new URL(campaignUrl).pathname.split('/').pop()!;
  const held = new Set(['berachos', 'peah', 'demai', 'kilayim']);
  const rest = ALL_MASECHTA_IDS.filter((id) => !held.has(id));
  const assign = await page.request.post(`/api/campaigns/${campaignId}/claims`, {
    data: { name: 'The whole family', masechtaIds: rest },
  });
  expect(assign.ok()).toBe(true);
  const claims = (await (await page.request.get(`/api/campaigns/${campaignId}/claims`)).json()) as {
    claims: { id: string; status: string }[];
  };
  for (const claim of claims.claims.filter((c) => c.status !== 'finished')) {
    const res = await page.request.patch(`/api/campaigns/${campaignId}/claims/${claim.id}`, { data: { status: 'completed' } });
    expect(res.ok()).toBe(true);
  }

  await second.goto(chartPath);
  await expect(second.getByRole('heading', { name: 'All of Shas has been finished' })).toBeVisible();
  await expect(second.getByText('63 of 63 masechtos finished, 0 taken, 0 still open')).toBeVisible();
  await page.reload();
  await expect(page.getByText('All 63 masechtos are finished.')).toBeVisible();
  const notice = await lastMessageTo(page, organizerEmail, 'campaign_complete');
  expect(notice.body).toContain('All 63 masechtos have been marked finished');

  await visitorContext.close();
  await secondContext.close();
});

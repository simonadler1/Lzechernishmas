import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const ORGANIZER_EMAIL = 'organizer@example.com';

/** The moment every page believes it is, so dates in screenshots never drift. */
export const FROZEN_NOW = new Date('2030-01-15T15:00:00Z');

export const isPhone = (testInfo: TestInfo) => testInfo.project.use.hasTouch === true;

/** Resets the test database and loads a named scenario from worker/dev/seed.ts. */
export async function seed(page: Page, scenario: string) {
  const res = await page.request.post(`/api/dev/seed?scenario=${scenario}`);
  expect(res.ok(), `seed ${scenario}`).toBe(true);
}

interface OutboxMessage {
  to: string;
  template: string;
  body: string;
  subject: string | null;
  status: string;
}

export async function outbox(page: Page): Promise<OutboxMessage[]> {
  const res = await page.request.get('/api/dev/outbox');
  return ((await res.json()) as { messages: OutboxMessage[] }).messages;
}

/** The newest message to an address, read the way a tester reads /dev/outbox. */
export async function lastMessageTo(page: Page, to: string, template?: string): Promise<OutboxMessage> {
  const message = (await outbox(page)).find((m) => m.to === to && (!template || m.template === template));
  if (!message) throw new Error(`No ${template ?? ''} message to ${to} in the outbox`);
  return message;
}

export async function lastCodeFor(page: Page, to: string): Promise<string> {
  const code = (await lastMessageTo(page, to)).body.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code in the newest message to ${to}`);
  return code;
}

/** The first link in a message, as a path on the site under test. */
export function linkPath(message: OutboxMessage, prefix: string): string {
  const url = message.body.match(/https?:\/\/[^\s]+/g)?.find((u) => new URL(u).pathname.startsWith(prefix));
  if (!url) throw new Error(`No ${prefix} link in the message`);
  return new URL(url).pathname;
}

/** Logs the organizer in without the UI. The session cookie lands in the page's context. */
export async function loginByApi(page: Page, email = ORGANIZER_EMAIL) {
  await page.request.post('/api/auth/request-code', { data: { email } });
  const res = await page.request.post('/api/auth/verify', { data: { email, code: await lastCodeFor(page, email) } });
  expect(res.ok(), 'login').toBe(true);
}

/** A tap on phones and a click on desktop. */
export async function press(locator: Locator, testInfo: TestInfo) {
  if (isPhone(testInfo)) await locator.tap();
  else await locator.click();
}

/** Waits until data has loaded: no skeletons left, fonts ready, network quiet. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-skeleton]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

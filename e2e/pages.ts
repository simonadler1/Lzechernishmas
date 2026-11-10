import type { Page } from '@playwright/test';

/**
 * Every page of the app, in each state worth looking at. pages.spec.ts runs the
 * layout, tap-target, input, accessibility, error and screenshot checks on each
 * entry at every device size. Adding a page to the suite is adding a line here.
 */
export interface PageEntry {
  /** Names the test and the screenshot file. */
  name: string;
  path: string;
  /** Seed scenario from worker/dev/seed.ts, loaded before the page opens. */
  scenario: string;
  /** Log the organizer in first. */
  login?: boolean;
  /** Runs before the page opens, for state a seed cannot create, such as a cookie. */
  before?: (page: Page) => Promise<void>;
  /** Runs after the page has loaded, for example to open a form. */
  setup?: (page: Page) => Promise<void>;
}

export const PAGES: PageEntry[] = [
  { name: 'login', path: '/login', scenario: 'empty' },
  {
    name: 'login-code-step',
    path: '/login',
    scenario: 'empty',
    setup: async (page) => {
      await page.getByLabel('Email').fill('organizer@example.com');
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByLabel('6-digit code').waitFor();
    },
  },
  { name: 'outbox-empty', path: '/dev/outbox', scenario: 'empty' },
  { name: 'not-found', path: '/no-such-page', scenario: 'empty' },
];

/** JavaScript downloaded to show a page, gzipped. Keeps the public entry path light. */
export interface Budget {
  name: string;
  path: string;
  scenario: string;
  maxGzipKb: number;
}

export const BUDGETS: Budget[] = [{ name: 'login', path: '/login', scenario: 'empty', maxGzipKb: 200 }];

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
  /** Error responses this state is about, such as the 404 behind a not-found page. */
  expectedErrors?: { status: number; path: string }[];
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

  { name: 'campaigns-empty', path: '/campaigns', scenario: 'organizer', login: true },
  { name: 'campaigns', path: '/campaigns', scenario: 'partly-taken', login: true },
  { name: 'campaigns-long-names', path: '/campaigns', scenario: 'long-names', login: true },
  { name: 'campaign-new', path: '/campaigns/new', scenario: 'organizer', login: true },
  {
    name: 'campaign-new-errors',
    path: '/campaigns/new',
    scenario: 'organizer',
    login: true,
    expectedErrors: [{ status: 400, path: '/api/campaigns' }],
    setup: async (page) => {
      await page.getByLabel('Target date').fill('2031-03-15');
      await page.getByRole('button', { name: 'Create campaign' }).click();
      await page.getByText('Enter the name in Hebrew.').waitFor();
    },
  },
  { name: 'campaign-draft', path: '/campaigns/seed-draft', scenario: 'partly-taken', login: true },
  { name: 'campaign-active', path: '/campaigns/seed-active', scenario: 'partly-taken', login: true },
  { name: 'campaign-long-names', path: '/campaigns/seed-active', scenario: 'long-names', login: true },
  {
    name: 'campaign-edit',
    path: '/campaigns/seed-active',
    scenario: 'partly-taken',
    login: true,
    setup: async (page) => {
      await page.getByRole('button', { name: 'Edit details' }).click();
      await page.getByLabel('Name in Hebrew').waitFor();
    },
  },
  {
    name: 'campaign-archive-confirm',
    path: '/campaigns/seed-active',
    scenario: 'partly-taken',
    login: true,
    setup: async (page) => {
      await page.getByRole('button', { name: 'Archive campaign' }).click();
      await page.getByRole('button', { name: 'Keep it' }).waitFor();
    },
  },
  {
    name: 'campaign-missing',
    path: '/campaigns/no-such-campaign',
    scenario: 'organizer',
    login: true,
    expectedErrors: [{ status: 404, path: '/api/campaigns/no-such-campaign' }],
  },
];

/** JavaScript downloaded to show a page, gzipped. Keeps the public entry path light. */
export interface Budget {
  name: string;
  path: string;
  scenario: string;
  maxGzipKb: number;
}

export const BUDGETS: Budget[] = [{ name: 'login', path: '/login', scenario: 'empty', maxGzipKb: 200 }];

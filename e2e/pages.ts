import type { Page } from '@playwright/test';
import { manageToken, signInToken } from './tokens';

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

/** Takes a masechta through the API, so this browser's device cookie remembers it. */
const takeAsVisitor = async (page: Page) => {
  const res = await page.request.post('/api/public/campaigns/chart234/claims', {
    data: { name: 'Returning Visitor', masechtaIds: ['chagigah', 'kiddushin'] },
  });
  if (!res.ok()) throw new Error(`Could not take a masechta: ${res.status()}`);
};

const CHART = '/c/chart234';

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

  { name: 'chart-partly-taken', path: CHART, scenario: 'partly-taken' },
  { name: 'chart-completed', path: CHART, scenario: 'completed' },
  { name: 'chart-long-names', path: CHART, scenario: 'long-names' },
  { name: 'chart-past-date', path: CHART, scenario: 'past-date' },
  { name: 'chart-yours', path: CHART, scenario: 'partly-taken', before: takeAsVisitor },
  {
    name: 'chart-only-open',
    path: CHART,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByLabel("Show only what's still open").check();
    },
  },
  {
    name: 'chart-selected',
    path: CHART,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: /Kilayim/ }).click();
      await page.getByRole('button', { name: /Sheviis/ }).click();
      await page.getByText('2 selected').waitFor();
    },
  },
  {
    name: 'chart-form',
    path: CHART,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: /Kilayim/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Phone (optional)').fill('718-555-0142');
    },
  },
  {
    name: 'chart-taken-confirmation',
    path: CHART,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: /Kilayim/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Your name', { exact: true }).fill('Name Only');
      await page.getByRole('button', { name: 'Take this masechta' }).click();
      await page.getByRole('heading', { name: 'Taken' }).waitFor();
    },
  },
  {
    name: 'chart-sign-in',
    path: CHART,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Already took a masechta? Sign in' }).click();
      await page.getByLabel('Phone or email').fill('718-555-0101');
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByLabel('6-digit code').waitFor();
    },
  },
  // p1 holds finished and taken masechtos; p5 holds only taken ones; p3 has finished everything.
  { name: 'portion', path: `/m/${manageToken('seed-active-p1')}`, scenario: 'partly-taken' },
  { name: 'portion-all-finished', path: `/m/${manageToken('seed-active-p3')}`, scenario: 'partly-taken' },
  { name: 'portion-long-names', path: `/m/${manageToken('seed-active-p1')}`, scenario: 'long-names' },
  {
    name: 'portion-edit',
    path: `/m/${manageToken('seed-active-p5')}`,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Edit my details' }).click();
      await page.getByLabel('Your name', { exact: true }).waitFor();
    },
  },
  {
    name: 'portion-give-back-confirm',
    path: `/m/${manageToken('seed-active-p5')}`,
    scenario: 'partly-taken',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Give it back' }).first().click();
      await page.getByRole('button', { name: 'Keep it' }).waitFor();
    },
  },
  {
    name: 'portion-two-submissions',
    path: `/m/${signInToken('seed-active', 'sms', '+17185550101')}`,
    scenario: 'shared-phone',
  },
  {
    name: 'portion-invalid',
    path: `/m/${manageToken('seed-active-p1').slice(0, -2)}xx`,
    scenario: 'partly-taken',
    expectedErrors: [{ status: 404, path: '/api/manage/' }],
  },
  {
    name: 'chart-not-found',
    path: '/c/nothing22',
    scenario: 'empty',
    expectedErrors: [
      { status: 404, path: '/api/public/campaigns/nothing22' },
    ],
  },
];

/** JavaScript downloaded to show a page, gzipped. Keeps the public entry path light. */
export interface Budget {
  name: string;
  path: string;
  scenario: string;
  maxGzipKb: number;
}

export const BUDGETS: Budget[] = [
  { name: 'login', path: '/login', scenario: 'empty', maxGzipKb: 200 },
  // The page people reach from the QR code, often on a slow connection in shul.
  { name: 'public chart', path: CHART, scenario: 'partly-taken', maxGzipKb: 200 },
];

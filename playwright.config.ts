import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '8788';

/**
 * Four device projects, all in Chromium (see plan/DECISIONS.md). They share one
 * local database that each test re-seeds, so tests run one at a time.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  snapshotPathTemplate: 'e2e/snapshots/{projectName}/{arg}{ext}',
  expect: {
    // A fixed number of pixels, not a share of the page. Pages here are thousands of pixels
    // tall, and a 1% allowance once let a changed header pass unnoticed.
    toHaveScreenshot: { maxDiffPixels: 150, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    {
      name: 'small-phone',
      use: { browserName: 'chromium', viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
  },
});

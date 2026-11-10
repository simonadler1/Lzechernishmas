import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Worker and shared code, run inside the Workers runtime with a real local D1.
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                TOKEN_SECRET: 'test-token-secret',
                // Read here in Node, applied inside the Workers runtime by worker/test-setup.ts.
                TEST_MIGRATIONS: await readD1Migrations('./migrations'),
              },
            },
          })),
        ],
        define: { __COMMIT__: JSON.stringify('test-commit') },
        test: {
          name: 'worker',
          include: ['worker/**/*.test.ts', 'shared/**/*.test.ts'],
          setupFiles: ['./worker/test-setup.ts'],
        },
      },
      {
        // Deploy scripts and browser-side helpers, run in Node.
        test: {
          name: 'node',
          environment: 'node',
          include: ['scripts/**/*.test.ts', 'src/**/*.test.ts'],
        },
      },
    ],
  },
});

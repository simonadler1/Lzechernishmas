import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
  test: {
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['./worker/test-setup.ts'],
  },
});

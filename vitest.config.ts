import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TOKEN_SECRET: 'test-token-secret' } },
    }),
  ],
  test: {
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.ts'],
  },
});

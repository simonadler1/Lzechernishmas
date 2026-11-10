import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { currentCommit } from './scripts/lib/commit.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // /api/health reports this, and the deploy script checks it after deploying.
  define: { __COMMIT__: JSON.stringify(currentCommit()) },
  server: { port: 5173, strictPort: true },
});

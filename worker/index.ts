import { Hono } from 'hono';

export type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

export default {
  fetch: app.fetch,
  // Runs hourly. Task 15 adds the reminder runner.
  async scheduled() {},
} satisfies ExportedHandler<Env>;

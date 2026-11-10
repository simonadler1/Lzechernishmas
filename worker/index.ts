import { app } from './app';
import { runScheduled } from './scheduled';

export default {
  fetch: app.fetch,
  // Runs hourly.
  async scheduled(_controller, env) {
    await runScheduled(env);
  },
} satisfies ExportedHandler<Env>;

import { app } from './app';

export default {
  fetch: app.fetch,
  // Runs hourly. Task 15 adds the reminder runner.
  async scheduled() {},
} satisfies ExportedHandler<Env>;

import { runReminders, type ReminderRun } from './domain/reminders';
import { inMaintenance } from './lib/http';

export type ScheduledResult = ReminderRun & { skipped?: 'maintenance' };

/** The hourly job. During an account move it does nothing, and the reminders go out after the move. */
export async function runScheduled(env: Env, now: Date = new Date()): Promise<ScheduledResult> {
  if (inMaintenance(env)) {
    return { skipped: 'maintenance', sent: 0, suppressed: 0, failed: 0, campaigns: 0, capped: false };
  }
  return runReminders(env, now);
}

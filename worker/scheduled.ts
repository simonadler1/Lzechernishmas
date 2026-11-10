import { inMaintenance } from './lib/http';

export interface ScheduledResult {
  skipped?: 'maintenance';
  sent: number;
}

/** The hourly job. Task 15 adds the reminder runner here. */
export async function runScheduled(env: Env): Promise<ScheduledResult> {
  if (inMaintenance(env)) return { skipped: 'maintenance', sent: 0 };
  return { sent: 0 };
}

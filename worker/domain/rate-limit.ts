import { AppError } from '../lib/http';

/**
 * Fixed-window counter in the `rate_limits` table. One statement both counts
 * and restarts an expired window, so concurrent requests cannot slip past.
 * Returns true while the caller is within the limit.
 */
export async function checkRateLimit(
  env: Pick<Env, 'DB'>,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  )
    .bind(key, now.toISOString(), cutoff)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

export async function enforceRateLimit(
  env: Pick<Env, 'DB'>,
  key: string,
  limit: number,
  windowSeconds: number,
  now?: Date,
): Promise<void> {
  if (!(await checkRateLimit(env, key, limit, windowSeconds, now))) {
    throw new AppError(429, 'rate_limited', 'Too many tries. Please wait a while and try again.');
  }
}

export const HOUR = 3600;

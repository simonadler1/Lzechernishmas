import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

export type AppEnv = { Bindings: Env; Variables: { userId: string; campaign: import('../domain/campaigns').Campaign } };

/** Thrown anywhere in a request. `app.onError` turns it into the standard error body. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } };
}

/** Parses the JSON body with a zod schema. Failures become a 400 listing a message per field. */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'The request body must be JSON.');
  }
  return parseWith(schema, raw);
}

export function parseWith<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Please check the form.';
  throw new AppError(400, 'validation', first, { fields });
}

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

export const isProduction = (env: Env) => env.ENVIRONMENT === 'production';
export const isDevelopment = (env: Env) => env.ENVIRONMENT === 'development';

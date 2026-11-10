/** Thrown for every non-2xx response, carrying the server's standard error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** Per-field messages from a validation error. */
  get fields(): Record<string, string> {
    return (this.extra.fields as Record<string, string> | undefined) ?? {};
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }

  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
  const { code = 'unknown', message = 'Something went wrong. Please try again.', ...extra } = error ?? {};
  throw new ApiError(res.status, code, message, extra);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const fieldErrors = (error: unknown): Record<string, string> =>
  error instanceof ApiError ? error.fields : {};

import { Hono } from 'hono';
import { AppError, errorBody, type AppEnv } from './lib/http';
import { authRoutes } from './routes/auth';
import { devRoutes } from './routes/dev';
import { unsubscribeRoutes } from './routes/unsubscribe';

export const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoutes);
app.route('/api/dev', devRoutes);
app.route('/api/unsubscribe', unsubscribeRoutes);

app.notFound((c) => c.json(errorBody('not_found', 'Not found'), 404));

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(errorBody(error.code, error.message, error.extra), error.status);
  }
  console.error(error);
  return c.json(errorBody('internal', 'Something went wrong. Please try again.'), 500);
});

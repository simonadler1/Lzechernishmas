import { Hono } from 'hono';
import { AppError, errorBody, inMaintenance, type AppEnv } from './lib/http';
import { authRoutes } from './routes/auth';
import { campaignRoutes } from './routes/campaigns';
import { devRoutes } from './routes/dev';
import { manageRoutes } from './routes/manage';
import { publicRoutes } from './routes/public';
import { unsubscribeRoutes } from './routes/unsubscribe';

export const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT, commit: __COMMIT__ }));

// During a move between Cloudflare accounts the chart stays readable and
// nothing can be written. See docs/DEPLOYING.md.
app.use('/api/*', async (c, next) => {
  if (inMaintenance(c.env) && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    throw new AppError(503, 'maintenance', 'Signups are paused for a short while. Please try again soon.');
  }
  await next();
});

app.route('/api/auth', authRoutes);
app.route('/api/campaigns', campaignRoutes);
app.route('/api/dev', devRoutes);
app.route('/api/manage', manageRoutes);
app.route('/api/public', publicRoutes);
app.route('/api/unsubscribe', unsubscribeRoutes);

app.notFound((c) => c.json(errorBody('not_found', 'Not found'), 404));

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(errorBody(error.code, error.message, error.extra), error.status);
  }
  console.error(error);
  return c.json(errorBody('internal', 'Something went wrong. Please try again.'), 500);
});

import { createMiddleware } from 'hono/factory';
import type { Campaign } from '../domain/campaigns';
import { currentUser } from '../domain/sessions';
import { AppError, notFound, type AppEnv } from './http';

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new AppError(401, 'unauthorized', 'Please log in.');
  c.set('userId', user.id);
  await next();
});

/**
 * Loads the campaign named by `:id`. A campaign owned by someone else is
 * reported as missing, so its existence is not revealed.
 */
export const requireCampaignOwner = createMiddleware<AppEnv>(async (c, next) => {
  const campaign = await c.env.DB.prepare('SELECT * FROM campaigns WHERE id = ? AND owner_user_id = ?')
    .bind(c.req.param('id'), c.get('userId'))
    .first<Campaign>();
  if (!campaign) throw notFound('Campaign not found.');
  c.set('campaign', campaign);
  await next();
});

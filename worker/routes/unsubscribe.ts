import { Hono } from 'hono';
import { isOptedOut } from '../messaging/dispatch';
import { tokenSecret, verifyUnsubscribeToken } from '../domain/tokens';
import { notFound, type AppEnv } from '../lib/http';

export const unsubscribeRoutes = new Hono<AppEnv>();

async function resolve(env: Env, token: string) {
  const ref = await verifyUnsubscribeToken(tokenSecret(env), token);
  if (!ref) throw notFound('This unsubscribe link is not valid.');
  return ref;
}

unsubscribeRoutes.get('/:token', async (c) => {
  const ref = await resolve(c.env, c.req.param('token'));
  return c.json({ ...ref, optedOut: await isOptedOut(c.env, ref.channel, ref.address) });
});

unsubscribeRoutes.post('/:token', async (c) => {
  const ref = await resolve(c.env, c.req.param('token'));
  await c.env.DB.prepare('INSERT INTO opt_outs (channel, address, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
    .bind(ref.channel, ref.address, new Date().toISOString())
    .run();
  return c.json({ ...ref, optedOut: true });
});

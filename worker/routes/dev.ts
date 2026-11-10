import { Hono } from 'hono';
import { isProduction, notFound, type AppEnv } from '../lib/http';

export const devRoutes = new Hono<AppEnv>();

// Nothing under /api/dev exists in production.
devRoutes.use('*', async (c, next) => {
  if (isProduction(c.env)) throw notFound();
  await next();
});

devRoutes.get('/outbox', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, campaign_id, channel, to_address, template, subject, body, status, error, created_at, sent_at
     FROM outbound_messages ORDER BY created_at DESC, rowid DESC LIMIT 200`,
  ).all<{
    id: string;
    campaign_id: string | null;
    channel: string;
    to_address: string;
    template: string;
    subject: string | null;
    body: string;
    status: string;
    error: string | null;
    created_at: string;
    sent_at: string | null;
  }>();
  c.header('Cache-Control', 'no-store');
  return c.json({
    messages: results.map((m) => ({
      id: m.id,
      campaignId: m.campaign_id,
      channel: m.channel,
      to: m.to_address,
      template: m.template,
      subject: m.subject,
      body: m.body,
      status: m.status,
      error: m.error,
      createdAt: m.created_at,
      sentAt: m.sent_at,
    })),
  });
});

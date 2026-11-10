import { Hono } from 'hono';
import { localDate } from '../../shared/dates';
import { campaignCreateSchema, campaignUpdateSchema } from '../../shared/schemas';
import { generateSlug, getProgress, getProgressFor, toCampaignDto, type Campaign } from '../domain/campaigns';
import { requireCampaignOwner, requireUser } from '../lib/auth';
import { AppError, parseBody, type AppEnv } from '../lib/http';
import { addContactRoutes } from './contacts';
import { addOrganizerClaimRoutes } from './organizer-claims';

export const campaignRoutes = new Hono<AppEnv>();

campaignRoutes.use('*', requireUser);
campaignRoutes.use('/:id', requireCampaignOwner);
campaignRoutes.use('/:id/*', requireCampaignOwner);

const endDateError = (message: string) => new AppError(400, 'validation', message, { fields: { endDate: message } });

function requireFutureDate(endDate: string, timezone: string, now = new Date()) {
  if (endDate <= localDate(now, timezone)) throw endDateError('Choose a target date after today.');
}

async function reload(env: Env, id: string): Promise<Campaign> {
  const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(id).first<Campaign>();
  if (!campaign) throw new Error(`Campaign ${id} disappeared`);
  return campaign;
}

const respond = async (env: Env, campaign: Campaign) => ({
  campaign: toCampaignDto(campaign, await getProgress(env, campaign)),
});

campaignRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM campaigns WHERE owner_user_id = ?
     ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, created_at DESC`,
  )
    .bind(c.get('userId'))
    .all<Campaign>();
  const progress = await getProgressFor(
    c.env,
    results.map((campaign) => campaign.id),
  );
  return c.json({ campaigns: results.map((campaign) => toCampaignDto(campaign, progress.get(campaign.id)!)) });
});

campaignRoutes.post('/', async (c) => {
  const input = await parseBody(c, campaignCreateSchema);
  requireFutureDate(input.endDate, input.timezone);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  for (let attempt = 0; ; attempt++) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO campaigns (id, owner_user_id, slug, title, honoree_name_he, honoree_name_en, dedication_type,
           message, end_date, timezone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
        .bind(
          id, c.get('userId'), generateSlug(), input.title, input.honoreeNameHe, input.honoreeNameEn,
          input.dedicationType, input.message, input.endDate, input.timezone, now, now,
        )
        .run();
      break;
    } catch (error) {
      // A slug collision is the only expected failure; try a new slug a few times.
      if (attempt >= 4 || !String(error).includes('campaigns.slug')) throw error;
    }
  }
  return c.json(await respond(c.env, await reload(c.env, id)), 201);
});

campaignRoutes.get('/:id', async (c) => c.json(await respond(c.env, c.get('campaign'))));

campaignRoutes.patch('/:id', async (c) => {
  const campaign = c.get('campaign');
  const input = await parseBody(c, campaignUpdateSchema);
  if (campaign.status === 'archived') {
    throw new AppError(409, 'invalid_state', 'An archived campaign cannot be changed.');
  }

  const timezone = input.timezone ?? campaign.timezone;
  const endDate = input.endDate ?? campaign.end_date;
  // Moving the date is allowed at any time, but only to a day still ahead.
  if (endDate !== campaign.end_date) requireFutureDate(endDate, timezone);

  await c.env.DB.prepare(
    `UPDATE campaigns SET title = ?, honoree_name_he = ?, honoree_name_en = ?, dedication_type = ?, message = ?,
       end_date = ?, timezone = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      input.title ?? campaign.title,
      input.honoreeNameHe ?? campaign.honoree_name_he,
      input.honoreeNameEn === undefined ? campaign.honoree_name_en : input.honoreeNameEn,
      input.dedicationType ?? campaign.dedication_type,
      input.message === undefined ? campaign.message : input.message,
      endDate,
      timezone,
      new Date().toISOString(),
      campaign.id,
    )
    .run();
  return c.json(await respond(c.env, await reload(c.env, campaign.id)));
});

campaignRoutes.post('/:id/activate', async (c) => {
  const campaign = c.get('campaign');
  if (campaign.status !== 'draft') {
    throw new AppError(409, 'invalid_state', 'Only a draft campaign can be activated.');
  }
  const now = new Date();
  requireFutureDate(campaign.end_date, campaign.timezone, now);
  await c.env.DB.prepare(`UPDATE campaigns SET status = 'active', activated_on = ?, updated_at = ? WHERE id = ?`)
    .bind(localDate(now, campaign.timezone), now.toISOString(), campaign.id)
    .run();
  return c.json(await respond(c.env, await reload(c.env, campaign.id)));
});

campaignRoutes.post('/:id/archive', async (c) => {
  const campaign = c.get('campaign');
  await c.env.DB.prepare(`UPDATE campaigns SET status = 'archived', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), campaign.id)
    .run();
  return c.json(await respond(c.env, await reload(c.env, campaign.id)));
});

addOrganizerClaimRoutes(campaignRoutes);
addContactRoutes(campaignRoutes);

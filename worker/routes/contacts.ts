import type { Hono } from 'hono';
import type { ContactDto, ContactRowResult, InvitationsResult } from '../../shared/api-types';
import { contactsBatchSchema, invitationsSchema } from '../../shared/schemas';
import { campaignText } from '../domain/campaigns';
import { normalizeEmail, normalizePhone } from '../domain/phone';
import { AppError, notFound, parseBody, type AppEnv } from '../lib/http';
import { chooseChannel, dispatch } from '../messaging/dispatch';
import { publicUrl, unsubscribeUrl } from '../messaging/links';
import { invitation } from '../messaging/templates';

interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  invited_at: string | null;
}

/** Contact and invitation routes under /api/campaigns/:id. The owner check has already run. */
export function addContactRoutes(routes: Hono<AppEnv>) {
  routes.get('/:id/contacts', async (c) => {
    const campaignId = c.get('campaign').id;
    const { results } = await c.env.DB.prepare(
      `SELECT contacts.id, contacts.name, contacts.phone, contacts.email, contacts.invited_at,
         EXISTS (
           SELECT 1 FROM participants JOIN claims ON claims.participant_id = participants.id
           WHERE participants.campaign_id = contacts.campaign_id AND claims.status <> 'released'
             AND ((contacts.phone IS NOT NULL AND participants.phone = contacts.phone)
               OR (contacts.email IS NOT NULL AND participants.email = contacts.email))
         ) AS has_taken
       FROM contacts WHERE contacts.campaign_id = ? ORDER BY contacts.created_at, contacts.rowid`,
    )
      .bind(campaignId)
      .all<ContactRow & { has_taken: number }>();
    const contacts: ContactDto[] = results.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      invitedAt: row.invited_at,
      hasTaken: row.has_taken === 1,
    }));
    c.header('Cache-Control', 'no-store');
    return c.json({ contacts });
  });

  // Every row gets its own verdict, and good rows are saved even when others are not.
  routes.post('/:id/contacts', async (c) => {
    const campaign = c.get('campaign');
    const { rows } = await parseBody(c, contactsBatchSchema);
    const results: ContactRowResult[] = [];

    for (const row of rows) {
      const name = row.name.trim();
      const invalid = (reason: string) => results.push({ status: 'invalid', name, reason });

      if (!name) {
        invalid('No name.');
        continue;
      }
      const phone = row.phone?.trim() ? normalizePhone(row.phone, campaign.timezone) : null;
      const email = row.email?.trim() ? normalizeEmail(row.email) : null;
      if (row.phone?.trim() && !phone) {
        invalid('The phone number is not valid.');
        continue;
      }
      if (row.email?.trim() && !email) {
        invalid('The email address is not valid.');
        continue;
      }
      if (!phone && !email) {
        invalid('No phone number or email.');
        continue;
      }

      try {
        await c.env.DB.prepare(
          'INSERT INTO contacts (id, campaign_id, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
          .bind(crypto.randomUUID(), campaign.id, name, phone, email, new Date().toISOString())
          .run();
        results.push({ status: 'added', name });
      } catch (error) {
        if (!String(error).includes('UNIQUE')) throw error;
        results.push({ status: 'duplicate', name, reason: 'Already in your contacts.' });
      }
    }
    return c.json({ results });
  });

  routes.delete('/:id/contacts/:contactId', async (c) => {
    const deleted = await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND campaign_id = ?')
      .bind(c.req.param('contactId'), c.get('campaign').id)
      .run();
    if (deleted.meta.changes === 0) throw notFound('That contact is not in this campaign.');
    return c.json({ ok: true });
  });

  routes.post('/:id/invitations', async (c) => {
    const campaign = c.get('campaign');
    const input = await parseBody(c, invitationsSchema);
    if (campaign.status !== 'active') {
      throw new AppError(409, 'not_active', 'Activate the campaign before sending invitations.');
    }

    const all = await c.env.DB.prepare('SELECT id, name, phone, email, invited_at FROM contacts WHERE campaign_id = ?')
      .bind(campaign.id)
      .all<ContactRow>();
    // No list means everyone who has not been invited yet.
    const targets = input.contactIds
      ? all.results.filter((contact) => input.contactIds!.includes(contact.id))
      : all.results.filter((contact) => contact.invited_at === null);

    const owner = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(campaign.owner_user_id)
      .first<{ name: string | null }>();
    const result: InvitationsResult = { sent: 0, suppressed: 0, alreadyInvited: 0, failed: 0 };

    for (const contact of targets) {
      const to = chooseChannel(contact);
      if (!to) continue;
      const status = await dispatch(c.env, {
        campaignId: campaign.id,
        channel: to.channel,
        to: to.address,
        template: 'invitation',
        // One invitation per contact per campaign, however often this is pressed.
        dedupeKey: `invite:${campaign.id}:${contact.id}`,
        ...invitation(to.channel, {
          campaign: campaignText(campaign),
          organizerName: owner?.name ?? null,
          publicUrl: publicUrl(c.env, campaign.slug),
          unsubscribeUrl: await unsubscribeUrl(c.env, to),
        }),
      });
      if (status === 'sent') result.sent++;
      else if (status === 'suppressed') result.suppressed++;
      else if (status === 'duplicate') result.alreadyInvited++;
      else result.failed++;

      if (status !== 'failed' && contact.invited_at === null) {
        await c.env.DB.prepare('UPDATE contacts SET invited_at = ? WHERE id = ?')
          .bind(new Date().toISOString(), contact.id)
          .run();
      }
    }
    return c.json(result);
  });
}

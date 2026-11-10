import type { Hono } from 'hono';
import type { OrganizerClaim } from '../../shared/api-types';
import { claimStatusSchema, organizerClaimSchema, participantDetailsSchema } from '../../shared/schemas';
import { compareMasechtos } from '../../shared/shas';
import { createClaims, setClaimStatus } from '../domain/claims';
import { normalizeDetails, sendClaimConfirmation, toSubmissions, updateParticipant } from '../domain/participants';
import { parseBody, type AppEnv } from '../lib/http';
import { chooseChannel } from '../messaging/dispatch';

/** Claim routes under /api/campaigns/:id. The owner check has already run. */
export function addOrganizerClaimRoutes(routes: Hono<AppEnv>) {
  routes.get('/:id/claims', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT claims.id, claims.masechta_id, claims.status, claims.claimed_at, claims.completed_at,
              participants.id AS participant_id, participants.name, participants.phone, participants.email,
              participants.is_anonymous, participants.source
       FROM claims JOIN participants ON participants.id = claims.participant_id
       WHERE claims.campaign_id = ? AND claims.status <> 'released'`,
    )
      .bind(c.get('campaign').id)
      .all<{
        id: string;
        masechta_id: string;
        status: 'claimed' | 'completed';
        claimed_at: string;
        completed_at: string | null;
        participant_id: string;
        name: string;
        phone: string | null;
        email: string | null;
        is_anonymous: number;
        source: 'public' | 'organizer';
      }>();
    const claims: OrganizerClaim[] = results
      .sort((a, b) => compareMasechtos(a.masechta_id, b.masechta_id))
      .map((row) => ({
        id: row.id,
        masechtaId: row.masechta_id,
        status: row.status === 'completed' ? 'finished' : 'taken',
        claimedAt: row.claimed_at,
        completedAt: row.completed_at,
        participant: {
          id: row.participant_id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          isAnonymous: row.is_anonymous === 1,
          source: row.source,
        },
      }));
    c.header('Cache-Control', 'no-store');
    return c.json({ claims });
  });

  // Assign on someone's behalf: for people without a phone, or to copy over a paper chart.
  routes.post('/:id/claims', async (c) => {
    const campaign = c.get('campaign');
    const input = await parseBody(c, organizerClaimSchema);
    const details = normalizeDetails(input, campaign.timezone);
    const { participantId } = await createClaims(c.env, campaign, details, input.masechtaIds, 'organizer');
    const to = chooseChannel(details);
    if (to) await sendClaimConfirmation(c.env, campaign, participantId, to);
    return c.json({ participantId, masechtaIds: input.masechtaIds, notified: to !== null }, 201);
  });

  routes.patch('/:id/claims/:claimId', async (c) => {
    const { status } = await parseBody(c, claimStatusSchema);
    const claim = await setClaimStatus(c.env, c.get('campaign'), c.req.param('claimId'), status);
    return c.json({ claim: { id: claim.id, masechtaId: claim.masechta_id, status: claim.status } });
  });

  routes.patch('/:id/participants/:participantId', async (c) => {
    const campaign = c.get('campaign');
    const input = await parseBody(c, participantDetailsSchema);
    const details = normalizeDetails(input, campaign.timezone);
    const updated = await updateParticipant(c.env, campaign, c.req.param('participantId'), details);
    const [submission] = await toSubmissions(c.env, [updated]);
    return c.json({ submission });
  });
}

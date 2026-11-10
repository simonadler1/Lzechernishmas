import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createCampaign, createClaim, createParticipant } from './test-utils';

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

describe('claims_one_holder', () => {
  it('rejects a second live claim on the same masechta in one campaign', async () => {
    const campaign = await createCampaign();
    const a = await createParticipant({ campaign_id: campaign.id });
    const b = await createParticipant({ campaign_id: campaign.id, name: 'Dovid Levi' });
    await createClaim({ campaign_id: campaign.id, participant_id: a.id, masechta_id: 'peah' });
    await expect(
      createClaim({ campaign_id: campaign.id, participant_id: b.id, masechta_id: 'peah' }),
    ).rejects.toThrow(/UNIQUE/);
    expect(await count('claims')).toBe(1);
  });

  it('allows the same masechta in a different campaign', async () => {
    const one = await createCampaign();
    const two = await createCampaign();
    const a = await createParticipant({ campaign_id: one.id });
    const b = await createParticipant({ campaign_id: two.id });
    await createClaim({ campaign_id: one.id, participant_id: a.id, masechta_id: 'peah' });
    await createClaim({ campaign_id: two.id, participant_id: b.id, masechta_id: 'peah' });
    expect(await count('claims')).toBe(2);
  });

  it('frees a masechta once its claim is released', async () => {
    const campaign = await createCampaign();
    const a = await createParticipant({ campaign_id: campaign.id });
    const b = await createParticipant({ campaign_id: campaign.id });
    await createClaim({ campaign_id: campaign.id, participant_id: a.id, masechta_id: 'peah', status: 'released' });
    await createClaim({ campaign_id: campaign.id, participant_id: b.id, masechta_id: 'peah' });
    expect(await count('claims')).toBe(2);
  });

  it('keeps a completed masechta blocked', async () => {
    const campaign = await createCampaign();
    const a = await createParticipant({ campaign_id: campaign.id });
    const b = await createParticipant({ campaign_id: campaign.id });
    await createClaim({ campaign_id: campaign.id, participant_id: a.id, masechta_id: 'peah', status: 'completed' });
    await expect(
      createClaim({ campaign_id: campaign.id, participant_id: b.id, masechta_id: 'peah' }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('rolls back a whole batch when one insert conflicts', async () => {
    const campaign = await createCampaign();
    const a = await createParticipant({ campaign_id: campaign.id });
    await createClaim({ campaign_id: campaign.id, participant_id: a.id, masechta_id: 'peah' });

    const participantId = crypto.randomUUID();
    const at = new Date().toISOString();
    const insertClaim = (masechtaId: string) =>
      env.DB.prepare(
        `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at)
         VALUES (?, ?, ?, ?, 'claimed', ?)`,
      ).bind(crypto.randomUUID(), campaign.id, participantId, masechtaId, at);

    await expect(
      env.DB.batch([
        env.DB.prepare(
          `INSERT INTO participants (id, campaign_id, name, source, created_at) VALUES (?, ?, ?, 'public', ?)`,
        ).bind(participantId, campaign.id, 'Late Arrival', at),
        insertClaim('demai'),
        insertClaim('peah'),
      ]),
    ).rejects.toThrow(/UNIQUE/);

    expect(await count('participants')).toBe(1);
    expect(await count('claims')).toBe(1);
  });
});

describe('test isolation', () => {
  it('starts each test with empty tables', async () => {
    expect(await count('campaigns')).toBe(0);
    expect(await count('claims')).toBe(0);
  });
});

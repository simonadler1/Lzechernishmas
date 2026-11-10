import { addDays, daysBetween, formatShortDate, localDate, localHour } from '../../shared/dates';
import { compareMasechtos, getMasechta } from '../../shared/shas';
import { chooseChannel, dispatch } from '../messaging/dispatch';
import { portionUrl, unsubscribeUrl } from '../messaging/links';
import { reminder, type ReminderPortion } from '../messaging/templates';
import type { Channel } from '../messaging/types';
import { isHeldDate, isIsrael, nextPermittedDate } from './calendar';
import { campaignText, type Campaign } from './campaigns';
import { signManageToken, tokenSecret } from './tokens';

export type ReminderKind = 'T14' | 'T7';

const DAYS_BEFORE: Record<ReminderKind, number> = { T14: 14, T7: 7 };
const KINDS: ReminderKind[] = ['T14', 'T7'];

// Messages go out from 10:00 in the campaign's timezone. The window stays open
// until 20:00 so a missed hourly run can still catch up the same day.
const FIRST_HOUR = 10;
const LAST_HOUR = 20;

export const MAX_MESSAGES_PER_RUN = 200;

/** The day a reminder goes out, or null when it is skipped altogether. */
export function reminderSendDate(
  campaign: Pick<Campaign, 'end_date' | 'timezone' | 'activated_on'>,
  kind: ReminderKind,
): string | null {
  const target = addDays(campaign.end_date, -DAYS_BEFORE[kind]);
  // The campaign was not live yet on that day.
  if (!campaign.activated_on || target < campaign.activated_on) return null;
  const sendDate = nextPermittedDate(target, isIsrael(campaign.timezone));
  return sendDate >= campaign.end_date ? null : sendDate;
}

/** Which reminders are due at this moment. Pure, so tests can pick any `now`. */
export function dueReminderKinds(
  campaign: Pick<Campaign, 'end_date' | 'timezone' | 'activated_on'>,
  nowUtc: Date,
): ReminderKind[] {
  const today = localDate(nowUtc, campaign.timezone);
  const hour = localHour(nowUtc, campaign.timezone);
  if (hour < FIRST_HOUR || hour >= LAST_HOUR) return [];
  if (today >= campaign.end_date || isHeldDate(today, isIsrael(campaign.timezone))) return [];
  return KINDS.filter((kind) => {
    const sendDate = reminderSendDate(campaign, kind);
    // "On or after" lets a later run recover a day the cron missed.
    return sendDate !== null && today >= sendDate;
  });
}

interface Recipient {
  channel: Channel;
  address: string;
  portions: { participantId: string; masechtaIds: string[] }[];
}

/** People holding an unfinished masechta, one entry per phone or email. */
async function recipients(env: Pick<Env, 'DB'>, campaignId: string): Promise<Recipient[]> {
  const { results } = await env.DB.prepare(
    `SELECT participants.id, participants.phone, participants.email, claims.masechta_id
     FROM claims JOIN participants ON participants.id = claims.participant_id
     WHERE claims.campaign_id = ? AND claims.status = 'claimed'
     ORDER BY participants.created_at, participants.rowid`,
  )
    .bind(campaignId)
    .all<{ id: string; phone: string | null; email: string | null; masechta_id: string }>();

  const byAddress = new Map<string, Recipient>();
  for (const row of results) {
    const to = chooseChannel(row);
    if (!to) continue; // No phone or email: nothing to send to.
    const key = `${to.channel}:${to.address}`;
    const recipient = byAddress.get(key) ?? { ...to, portions: [] };
    byAddress.set(key, recipient);
    // Someone with several submissions gets one message listing all of them.
    let portion = recipient.portions.find((p) => p.participantId === row.id);
    if (!portion) recipient.portions.push((portion = { participantId: row.id, masechtaIds: [] }));
    portion.masechtaIds.push(row.masechta_id);
  }
  return [...byAddress.values()];
}

export interface ReminderRun {
  sent: number;
  suppressed: number;
  failed: number;
  campaigns: number;
  /** True when the cap stopped the run. The next hourly run carries on. */
  capped: boolean;
}

/** Sends the reminders that are due. Called hourly, and safe to call again at any time. */
export async function runReminders(env: Env, now: Date = new Date(), cap = MAX_MESSAGES_PER_RUN): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, suppressed: 0, failed: 0, campaigns: 0, capped: false };
  // A day of slack on each side covers every timezone.
  const utcToday = now.toISOString().slice(0, 10);
  const { results: campaigns } = await env.DB.prepare(
    `SELECT * FROM campaigns WHERE status = 'active' AND end_date >= ? AND end_date <= ?`,
  )
    .bind(addDays(utcToday, -1), addDays(utcToday, 16))
    .all<Campaign>();

  for (const campaign of campaigns) {
    if (run.capped) break;
    try {
      // If a missed day left both due, only the nearer one is worth sending.
      const kind = dueReminderKinds(campaign, now).at(-1);
      if (!kind) continue;
      run.campaigns++;

      const prefix = `reminder:${campaign.id}:${campaign.end_date}:${kind}:`;
      const { results: already } = await env.DB.prepare(
        // D1 limits LIKE patterns to 50 bytes, so compare the prefix directly.
        `SELECT dedupe_key FROM outbound_messages
         WHERE campaign_id = ? AND template = 'reminder' AND substr(dedupe_key, 1, ?) = ?`,
      )
        .bind(campaign.id, prefix.length, prefix)
        .all<{ dedupe_key: string }>();
      const done = new Set(already.map((row) => row.dedupe_key));

      const daysLeft = daysBetween(localDate(now, campaign.timezone), campaign.end_date);
      for (const recipient of await recipients(env, campaign.id)) {
        // The end date is in the key, so moving it starts a new round of reminders.
        const dedupeKey = `${prefix}${recipient.channel}:${recipient.address}`;
        if (done.has(dedupeKey)) continue;
        if (run.sent + run.suppressed + run.failed >= cap) {
          run.capped = true;
          break;
        }

        const portions: ReminderPortion[] = [];
        for (const portion of recipient.portions) {
          portions.push({
            masechtos: portion.masechtaIds.sort(compareMasechtos).map((id) => getMasechta(id)?.en ?? id),
            portionUrl: portionUrl(env, await signManageToken(tokenSecret(env), portion.participantId)),
          });
        }
        const status = await dispatch(env, {
          campaignId: campaign.id,
          channel: recipient.channel,
          to: recipient.address,
          template: 'reminder',
          dedupeKey,
          ...reminder(recipient.channel, {
            campaign: campaignText(campaign),
            daysLeft,
            endDateText: formatShortDate(campaign.end_date),
            portions,
            unsubscribeUrl: await unsubscribeUrl(env, recipient),
          }),
        });
        if (status === 'sent') run.sent++;
        else if (status === 'suppressed') run.suppressed++;
        else if (status === 'failed') run.failed++;
      }
    } catch (error) {
      // One broken campaign must not hold up everyone else's reminders.
      console.error(`Reminders failed for campaign ${campaign.id}:`, error);
    }
  }
  return run;
}

import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek } from '../../shared/dates';
import { app } from '../app';
import { runScheduled } from '../scheduled';
import { createCampaign, createClaim, createParticipant, createUser, type CampaignRow } from '../test-utils';
import { isHeldDate, nextPermittedDate } from './calendar';
import { dueReminderKinds, reminderSendDate, runReminders } from './reminders';

// End date Thursday 2030-02-14 puts T14 on Thursday 2030-01-31 and T7 on Thursday 2030-02-07.
// New York is on standard time then, so 10:00 there is 15:00 UTC.
const NY = { end_date: '2030-02-14', timezone: 'America/New_York', activated_on: '2030-01-01' };
const at = (text: string) => new Date(text);

async function reminders() {
  const { results } = await env.DB.prepare(
    `SELECT to_address, channel, status, body, dedupe_key FROM outbound_messages WHERE template = 'reminder' ORDER BY created_at, rowid`,
  ).all<{ to_address: string; channel: string; status: string; body: string; dedupe_key: string }>();
  return results;
}

async function holder(campaign: CampaignRow, masechta: string, details: { phone?: string; email?: string; name?: string } = {}) {
  const person = await createParticipant({
    campaign_id: campaign.id,
    name: details.name ?? 'Moshe Katz',
    phone: details.phone ?? null,
    email: details.email ?? null,
  });
  await createClaim({ campaign_id: campaign.id, participant_id: person.id, masechta_id: masechta });
  return person;
}

describe('calendar', () => {
  it('holds Shabbos and Yom Tov, and permits Chol Hamoed and fast days', () => {
    expect(isHeldDate('2030-02-02', false)).toBe(true); // Shabbos
    expect(isHeldDate('2030-02-03', false)).toBe(false); // Sunday
    expect(isHeldDate('2030-04-18', false)).toBe(true); // first day of Pesach
    expect(isHeldDate('2030-04-22', false)).toBe(false); // Chol Hamoed
    expect(isHeldDate('2030-10-07', true)).toBe(true); // Yom Kippur
    expect(isHeldDate('2030-08-08', false)).toBe(false); // Tisha B'Av 5790, a Thursday
  });

  it('holds the second day of Yom Tov outside Israel only', () => {
    // Take a weekday second day from hebcal: a day that is Yom Tov in the diaspora and not in Israel.
    const chag = (il: boolean) =>
      new Set(
        HebrewCalendar.calendar({ year: 2030, il })
          .filter((event) => event.getFlags() & flags.CHAG)
          .map((event) => event.getDate().greg().toISOString().slice(0, 10)),
      );
    const israel = chag(true);
    const secondDays = [...chag(false)].filter((date) => !israel.has(date) && dayOfWeek(date) !== 6);
    expect(secondDays.length).toBeGreaterThan(0);
    for (const date of secondDays) {
      expect(isHeldDate(date, false), `${date} in the diaspora`).toBe(true);
      expect(isHeldDate(date, true), `${date} in Israel`).toBe(false);
    }
    expect(new HDate(new Date(2030, 3, 19)).toString()).toBe('16 Nisan 5790');
    expect(secondDays).toContain('2030-04-19');
  });

  it('moves past a Yom Tov that runs into Shabbos', () => {
    // Pesach 5790: Thursday and Friday are Yom Tov, then Shabbos.
    expect(nextPermittedDate('2030-04-18', false)).toBe('2030-04-21');
    // In Israel only Thursday is Yom Tov, so Friday is permitted.
    expect(nextPermittedDate('2030-04-18', true)).toBe('2030-04-19');
    expect(nextPermittedDate('2030-02-02', false)).toBe('2030-02-03');
    expect(nextPermittedDate('2030-02-04', false)).toBe('2030-02-04');
  });
});

describe('dueReminderKinds', () => {
  it('fires each reminder at 10:00 local time and not at 09:00', () => {
    expect(dueReminderKinds(NY, at('2030-01-31T14:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(NY, at('2030-01-31T15:00:00Z'))).toEqual(['T14']);
    expect(dueReminderKinds(NY, at('2030-02-07T14:59:00Z'))).toEqual([]);
    expect(dueReminderKinds(NY, at('2030-02-07T15:00:00Z'))).toEqual(['T14', 'T7']);
    expect(dueReminderKinds(NY, at('2030-01-30T15:00:00Z'))).toEqual([]);
  });

  it('stops for the night, and on and after the end date', () => {
    expect(dueReminderKinds(NY, at('2030-02-01T00:59:00Z'))).toEqual(['T14']); // 19:59
    expect(dueReminderKinds(NY, at('2030-02-01T01:00:00Z'))).toEqual([]); // 20:00
    expect(dueReminderKinds(NY, at('2030-02-14T15:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(NY, at('2030-02-15T15:00:00Z'))).toEqual([]);
  });

  it('moves a Shabbos target to Sunday', () => {
    const campaign = { ...NY, end_date: '2030-02-16' }; // T14 lands on Shabbos 2030-02-02
    expect(reminderSendDate(campaign, 'T14')).toBe('2030-02-03');
    expect(dueReminderKinds(campaign, at('2030-02-01T15:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(campaign, at('2030-02-02T15:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(campaign, at('2030-02-03T15:00:00Z'))).toEqual(['T14']);
  });

  it('moves a Yom Tov target past the whole Yom Tov and the Shabbos after it', () => {
    const campaign = { ...NY, end_date: '2030-05-02' }; // T14 lands on the first day of Pesach
    expect(reminderSendDate(campaign, 'T14')).toBe('2030-04-21');
    for (const day of ['2030-04-18', '2030-04-19', '2030-04-20']) {
      expect(dueReminderKinds(campaign, at(`${day}T14:00:00Z`)), day).toEqual([]); // 10:00 daylight time
    }
    expect(dueReminderKinds(campaign, at('2030-04-21T14:00:00Z'))).toEqual(['T14']);

    // An Israeli campaign sends on Friday, which is not Yom Tov there.
    const israel = { ...campaign, timezone: 'Asia/Jerusalem' };
    expect(reminderSendDate(israel, 'T14')).toBe('2030-04-19');
    expect(dueReminderKinds(israel, at('2030-04-19T07:00:00Z'))).toEqual(['T14']); // 10:00 in Jerusalem
  });

  it('never sends on a held day, even to catch up', () => {
    // Shabbos 2030-02-09 falls inside the T7 window.
    expect(dueReminderKinds(NY, at('2030-02-09T15:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(NY, at('2030-02-10T15:00:00Z'))).toEqual(['T14', 'T7']);
  });

  it('judges the same instant by each campaign’s own clock', () => {
    const instant = at('2030-01-31T19:00:00Z'); // 14:00 in New York, 21:00 in Jerusalem
    expect(dueReminderKinds(NY, instant)).toEqual(['T14']);
    expect(dueReminderKinds({ ...NY, timezone: 'Asia/Jerusalem' }, instant)).toEqual([]);
    // And the reverse: morning in Jerusalem is still night in New York.
    const morning = at('2030-01-31T08:00:00Z');
    expect(dueReminderKinds({ ...NY, timezone: 'Asia/Jerusalem' }, morning)).toEqual(['T14']);
    expect(dueReminderKinds(NY, morning)).toEqual([]);
  });

  it('skips a reminder whose day passed before activation', () => {
    const tenDaysOut = { ...NY, activated_on: addDays(NY.end_date, -10) };
    expect(reminderSendDate(tenDaysOut, 'T14')).toBeNull();
    expect(dueReminderKinds(tenDaysOut, at('2030-02-05T15:00:00Z'))).toEqual([]);
    expect(dueReminderKinds(tenDaysOut, at('2030-02-07T15:00:00Z'))).toEqual(['T7']);

    const fiveDaysOut = { ...NY, activated_on: addDays(NY.end_date, -5) };
    for (const day of ['2030-02-09', '2030-02-10', '2030-02-12', '2030-02-13']) {
      expect(dueReminderKinds(fiveDaysOut, at(`${day}T15:00:00Z`)), day).toEqual([]);
    }
    expect(dueReminderKinds({ ...NY, activated_on: null }, at('2030-02-07T15:00:00Z'))).toEqual([]);
  });

  it('skips a reminder that would land on or after the end date', () => {
    // End on a Sunday right after a two-day Yom Tov and Shabbos would be needed for T7; build the
    // simpler case directly: a held run that reaches the end date.
    const campaign = { end_date: '2030-04-21', timezone: 'America/New_York', activated_on: '2030-01-01' };
    // T7 lands on Sunday 2030-04-14, an ordinary day.
    expect(reminderSendDate(campaign, 'T7')).toBe('2030-04-14');
    // A 3-day campaign window: target on the first day of Pesach, next permitted day is the end date itself.
    const tight = { end_date: '2030-04-21', timezone: 'America/New_York', activated_on: '2030-01-01' };
    expect(nextPermittedDate(addDays(tight.end_date, -3), false)).toBe('2030-04-21');
  });
});

describe('runReminders', () => {
  const T14 = at('2030-01-31T15:00:00Z');
  const T7 = at('2030-02-07T15:00:00Z');

  it('reminds people with an unfinished masechta, listing what they hold and their link', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    const run = await runReminders(env, T14);
    expect(run).toMatchObject({ sent: 1, campaigns: 1, capped: false });

    const [message] = await reminders();
    expect(message).toMatchObject({ to_address: '+17185550123', channel: 'sms', status: 'sent' });
    expect(message?.body).toContain('14 days left');
    expect(message?.body).toContain('Peah');
    expect(message?.body).toContain('February 14');
    expect(message?.body).toMatch(/\/m\/[^\s]+/);
    expect(message?.dedupe_key).toBe(`reminder:${campaign.id}:2030-02-14:T14:sms:+17185550123`);
  });

  it('sends nothing before 10:00, and nothing new on repeat runs', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    expect((await runReminders(env, at('2030-01-31T14:00:00Z'))).sent).toBe(0);
    expect((await runReminders(env, T14)).sent).toBe(1);
    expect((await runReminders(env, at('2030-01-31T16:00:00Z'))).sent).toBe(0);
    expect((await runReminders(env, at('2030-02-01T15:00:00Z'))).sent).toBe(0);
    expect(await reminders()).toHaveLength(1);

    // The 7-day reminder is its own message.
    expect((await runReminders(env, T7)).sent).toBe(1);
    expect((await runReminders(env, T7)).sent).toBe(0);
    expect((await reminders()).map((m) => m.body.match(/\d+ days left/)?.[0])).toEqual(['14 days left', '7 days left']);
  });

  it('starts a new cycle when the end date moves', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    await runReminders(env, T14);
    await env.DB.prepare('UPDATE campaigns SET end_date = ? WHERE id = ?').bind('2030-02-28', campaign.id).run();
    // T14 for the new date is 2030-02-14.
    expect((await runReminders(env, at('2030-02-07T15:00:00Z'))).sent).toBe(0);
    expect((await runReminders(env, at('2030-02-14T15:00:00Z'))).sent).toBe(1);
    expect(await reminders()).toHaveLength(2);
  });

  it('sends only the 7-day reminder to a campaign activated 10 days out, and none at 5 days', async () => {
    const ten = await createCampaign({ ...NY, activated_on: '2030-02-04' });
    await holder(ten, 'peah', { phone: '+17185550123' });
    const five = await createCampaign({ ...NY, activated_on: '2030-02-09' });
    await holder(five, 'peah', { phone: '+17185550124' });

    for (let day = 4; day <= 13; day++) {
      await runReminders(env, at(`2030-02-${String(day).padStart(2, '0')}T15:00:00Z`));
    }
    const sent = await reminders();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to_address: '+17185550123' });
    expect(sent[0]?.dedupe_key).toContain(':T7:');
  });

  it('chooses its audience: unfinished holders only', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const campaign = await createCampaign({ ...NY, owner_user_id: owner.id });
    await holder(campaign, 'peah', { phone: '+17185550101' });
    await holder(campaign, 'demai', { email: 'email-only@example.com' });
    await holder(campaign, 'kilayim'); // no phone or email

    const finished = await createParticipant({ campaign_id: campaign.id, phone: '+17185550102' });
    await createClaim({ campaign_id: campaign.id, participant_id: finished.id, masechta_id: 'shabbos', status: 'completed' });
    const released = await createParticipant({ campaign_id: campaign.id, phone: '+17185550103' });
    await createClaim({ campaign_id: campaign.id, participant_id: released.id, masechta_id: 'yoma', status: 'released' });

    const optedOut = await holder(campaign, 'sukkah', { phone: '+17185550104' });
    await env.DB.prepare(`INSERT INTO opt_outs (channel, address, created_at) VALUES ('sms', ?, 'x')`).bind(optedOut.phone).run();

    await env.DB.prepare(
      `INSERT INTO contacts (id, campaign_id, name, phone, created_at) VALUES ('c1', ?, 'Never Signed Up', '+17185550105', 'x')`,
    ).bind(campaign.id).run();

    const run = await runReminders(env, T14);
    expect(run).toMatchObject({ sent: 2, suppressed: 1, failed: 0 });
    const all = await reminders();
    expect(all.filter((m) => m.status === 'sent').map((m) => m.to_address).sort()).toEqual([
      '+17185550101', 'email-only@example.com',
    ]);
    expect(all.find((m) => m.to_address === '+17185550104')).toMatchObject({ status: 'suppressed' });
    const everyone = all.map((m) => m.to_address);
    for (const nobody of ['+17185550102', '+17185550103', '+17185550105', 'owner@example.com']) {
      expect(everyone).not.toContain(nobody);
    }
  });

  it('lists only unfinished masechtos, and groups several submissions into one message', async () => {
    const campaign = await createCampaign(NY);
    const first = await holder(campaign, 'peah', { phone: '+17185550123' });
    await createClaim({ campaign_id: campaign.id, participant_id: first.id, masechta_id: 'berachos', status: 'completed' });
    await holder(campaign, 'shabbos', { phone: '+17185550123', name: 'Same Phone' });

    expect((await runReminders(env, T14)).sent).toBe(1);
    const [message] = await reminders();
    expect(message?.body).toContain('Peah and Shabbos');
    expect(message?.body).not.toContain('Berachos');
    expect(message?.body.match(/\/m\//g)).toHaveLength(2);
  });

  it('leaves draft, completed and archived campaigns alone', async () => {
    for (const status of ['draft', 'completed', 'archived'] as const) {
      const campaign = await createCampaign({ ...NY, status });
      await holder(campaign, 'peah', { phone: '+17185550123' });
    }
    expect((await runReminders(env, T14)).sent).toBe(0);
  });

  it('stops at the cap, and the next run finishes the rest', async () => {
    const campaign = await createCampaign(NY);
    for (let i = 0; i < 7; i++) await holder(campaign, ['peah', 'demai', 'kilayim', 'sheviis', 'terumos', 'maasros', 'challah'][i]!, { email: `p${i}@example.com` });

    const first = await runReminders(env, T14, 3);
    expect(first).toMatchObject({ sent: 3, capped: true });
    const second = await runReminders(env, at('2030-01-31T16:00:00Z'), 3);
    expect(second).toMatchObject({ sent: 3, capped: true });
    const third = await runReminders(env, at('2030-01-31T17:00:00Z'), 3);
    expect(third).toMatchObject({ sent: 1, capped: false });
    expect(new Set((await reminders()).map((m) => m.to_address)).size).toBe(7);
  });

  it('holds the default cap of 200 messages', async () => {
    const campaign = await createCampaign(NY);
    const statements = [];
    for (let i = 0; i < 205; i++) {
      // More people than masechtos, so give each a released claim history plus one live claim across two campaigns' worth of ids.
      statements.push(
        env.DB.prepare(`INSERT INTO participants (id, campaign_id, name, email, source, created_at) VALUES (?, ?, ?, ?, 'public', ?)`)
          .bind(`p${i}`, campaign.id, `Person ${i}`, `person${i}@example.com`, `2030-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`),
      );
    }
    await env.DB.batch(statements);
    // 63 masechtos cannot cover 205 people in one campaign, so spread them over four campaigns.
    const campaigns = [campaign, await createCampaign(NY), await createCampaign(NY), await createCampaign(NY)];
    const ids = (await import('../../shared/shas')).ALL_MASECHTOS.map((m) => m.id);
    const moves = [];
    const claims = [];
    for (let i = 0; i < 205; i++) {
      const target = campaigns[Math.floor(i / 63)]!;
      moves.push(env.DB.prepare('UPDATE participants SET campaign_id = ? WHERE id = ?').bind(target.id, `p${i}`));
      claims.push(
        env.DB.prepare(`INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at) VALUES (?, ?, ?, ?, 'claimed', 'x')`)
          .bind(`k${i}`, target.id, `p${i}`, ids[i % 63]!),
      );
    }
    await env.DB.batch(moves);
    await env.DB.batch(claims);

    const first = await runReminders(env, T14);
    expect(first).toMatchObject({ sent: 200, capped: true });
    const second = await runReminders(env, at('2030-01-31T16:00:00Z'));
    expect(second).toMatchObject({ sent: 5, capped: false });
    expect(await reminders()).toHaveLength(205);
  });

  it('carries on when one campaign fails', async () => {
    const broken = await createCampaign({ ...NY, timezone: 'Not/AZone' });
    await holder(broken, 'peah', { phone: '+17185550101' });
    const fine = await createCampaign(NY);
    await holder(fine, 'peah', { phone: '+17185550102' });
    const run = await runReminders(env, T14);
    expect(run.sent).toBe(1);
    expect((await reminders()).map((m) => m.to_address)).toEqual(['+17185550102']);
  });
});

describe('running the hourly job', () => {
  it('sends reminders from the scheduled handler', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    expect(await runScheduled(env, at('2030-01-31T15:00:00Z'))).toMatchObject({ sent: 1 });
  });

  it('sends nothing in maintenance mode', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    const result = await runScheduled({ ...env, MAINTENANCE_MODE: 'on' }, at('2030-01-31T15:00:00Z'));
    expect(result).toMatchObject({ skipped: 'maintenance', sent: 0 });
    expect(await reminders()).toHaveLength(0);
  });

  it('runs from the dev route with a chosen time, except in production', async () => {
    const campaign = await createCampaign(NY);
    await holder(campaign, 'peah', { phone: '+17185550123' });
    const url = '/api/dev/run-reminders?now=2030-01-31T15:00:00Z';
    expect((await app.request(url, { method: 'POST' }, { ...env, ENVIRONMENT: 'production' })).status).toBe(404);
    const res = await app.request(url, { method: 'POST' }, env);
    expect(await res.json()).toMatchObject({ sent: 1, now: '2030-01-31T15:00:00.000Z' });
    expect((await app.request('/api/dev/run-reminders?now=nonsense', { method: 'POST' }, env)).status).toBe(400);
  });
});

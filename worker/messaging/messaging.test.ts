import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { normalizeAddress, normalizeEmail, normalizePhone } from '../domain/phone';
import {
  signManageToken,
  signSignInToken,
  signUnsubscribeToken,
  verifyManageToken,
  verifyPortionToken,
  verifySignInToken,
  verifyUnsubscribeToken,
} from '../domain/tokens';
import { chooseChannel, dispatch } from './dispatch';
import { unsubscribeUrl } from './links';
import * as templates from './templates';
import type { MessageSender, OutboundMessage } from './types';

const okSender = () => {
  const send = vi.fn(async () => ({ providerId: 'p-1' }));
  return { send } satisfies MessageSender;
};

const message = (overrides: Partial<OutboundMessage> = {}): OutboundMessage => ({
  channel: 'sms',
  to: '+17185550123',
  template: 'claim_confirmation',
  body: 'hello',
  ...overrides,
});

async function outbox() {
  const { results } = await env.DB.prepare('SELECT * FROM outbound_messages ORDER BY created_at').all<{
    status: string;
    template: string;
    provider_id: string | null;
    error: string | null;
    sent_at: string | null;
  }>();
  return results;
}

const optOut = (channel: string, address: string) =>
  env.DB.prepare('INSERT INTO opt_outs (channel, address, created_at) VALUES (?, ?, ?)')
    .bind(channel, address, new Date().toISOString())
    .run();

describe('dispatch', () => {
  it('records a sent message', async () => {
    const sender = okSender();
    expect(await dispatch(env, message(), sender)).toBe('sent');
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'sent', provider_id: 'p-1' });
    expect(rows[0]?.sent_at).toBeTruthy();
  });

  it('works with the mock sender chosen by MESSAGING_MODE', async () => {
    expect(await dispatch(env, message())).toBe('sent');
  });

  it('suppresses an opted-out address without calling the sender', async () => {
    await optOut('sms', '+17185550123');
    const sender = okSender();
    expect(await dispatch(env, message(), sender)).toBe('suppressed');
    expect(sender.send).not.toHaveBeenCalled();
    expect((await outbox())[0]).toMatchObject({ status: 'suppressed' });
  });

  it('still sends codes to an opted-out address', async () => {
    await optOut('sms', '+17185550123');
    await optOut('email', 'a@example.com');
    const sender = okSender();
    expect(await dispatch(env, message({ template: 'participant_code' }), sender)).toBe('sent');
    expect(
      await dispatch(env, message({ template: 'login_code', channel: 'email', to: 'a@example.com' }), sender),
    ).toBe('sent');
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('sends once for two dispatches with one dedupe key', async () => {
    const sender = okSender();
    expect(await dispatch(env, message({ dedupeKey: 'k1' }), sender)).toBe('sent');
    expect(await dispatch(env, message({ dedupeKey: 'k1' }), sender)).toBe('duplicate');
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(await outbox()).toHaveLength(1);
  });

  it('records a failure when the sender throws', async () => {
    const sender: MessageSender = {
      send: async () => {
        throw new Error('provider down');
      },
    };
    expect(await dispatch(env, message(), sender)).toBe('failed');
    expect((await outbox())[0]).toMatchObject({ status: 'failed', error: 'provider down' });
  });
});

describe('chooseChannel', () => {
  it('prefers SMS, then email, then nothing', () => {
    expect(chooseChannel({ phone: '+1718', email: 'a@b.co' })).toEqual({ channel: 'sms', address: '+1718' });
    expect(chooseChannel({ phone: null, email: 'a@b.co' })).toEqual({ channel: 'email', address: 'a@b.co' });
    expect(chooseChannel({ phone: null, email: null })).toBeNull();
  });
});

describe('tokens', () => {
  const secret = 'secret-one';

  it('round-trips a manage token', async () => {
    const token = await signManageToken(secret, 'participant-1');
    expect(token.startsWith('participant-1.')).toBe(true);
    expect(await verifyManageToken(secret, token)).toBe('participant-1');
    expect(await verifyPortionToken(secret, token)).toEqual({ kind: 'manage', participantId: 'participant-1' });
  });

  it('round-trips an unsubscribe token', async () => {
    const ref = { channel: 'email', address: 'a:b@example.com' } as const;
    expect(await verifyUnsubscribeToken(secret, await signUnsubscribeToken(secret, ref))).toEqual(ref);
  });

  it('round-trips a sign-in token', async () => {
    const ref = { campaignId: 'c-1', channel: 'sms', address: '+17185550123' } as const;
    const token = await signSignInToken(secret, ref);
    expect(await verifySignInToken(secret, token)).toEqual(ref);
    expect(await verifyPortionToken(secret, token)).toEqual({ kind: 'signin', ...ref });
  });

  it('rejects tampered tokens, other secrets and other token kinds', async () => {
    const manage = await signManageToken(secret, 'participant-1');
    const signature = manage.split('.')[1];
    expect(await verifyManageToken(secret, `participant-2.${signature}`)).toBeNull();
    expect(await verifyManageToken(secret, manage.slice(0, -2) + (manage.endsWith('AA') ? 'BB' : 'AA'))).toBeNull();
    expect(await verifyManageToken('secret-two', manage)).toBeNull();
    expect(await verifyManageToken(secret, 'no-dot')).toBeNull();
    expect(await verifyManageToken(secret, '')).toBeNull();

    const unsub = await signUnsubscribeToken(secret, { channel: 'sms', address: '+17185550123' });
    expect(await verifySignInToken(secret, unsub)).toBeNull();
    expect(await verifyPortionToken(secret, unsub)).toBeNull();
    const signIn = await signSignInToken(secret, { campaignId: 'c-1', channel: 'sms', address: '+17185550123' });
    expect(await verifyUnsubscribeToken(secret, signIn)).toBeNull();
    const other = await signSignInToken(secret, { campaignId: 'c-2', channel: 'sms', address: '+17185550123' });
    expect(await verifySignInToken(secret, `${other.split('.')[0]}.${signIn.split('.')[1]}`)).toBeNull();
  });
});

describe('phone and email', () => {
  it('normalizes US and Israeli numbers by campaign timezone', () => {
    expect(normalizePhone('(718) 555-0123', 'America/New_York')).toBe('+17185550123');
    expect(normalizePhone('054-555-0123', 'Asia/Jerusalem')).toBe('+972545550123');
    expect(normalizePhone('+44 20 7946 0958', 'America/New_York')).toBe('+442079460958');
  });

  it('rejects garbage', () => {
    expect(normalizePhone('hello', 'America/New_York')).toBeNull();
    expect(normalizePhone('12345', 'America/New_York')).toBeNull();
    expect(normalizePhone('', 'Asia/Jerusalem')).toBeNull();
  });

  it('normalizes email', () => {
    expect(normalizeEmail('  Moshe@Example.COM ')).toBe('moshe@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
  });

  it('reads a typed address as phone or email', () => {
    expect(normalizeAddress('A@b.co', 'America/New_York')).toEqual({ channel: 'email', address: 'a@b.co' });
    expect(normalizeAddress('718-555-0123', 'America/New_York')).toEqual({ channel: 'sms', address: '+17185550123' });
    expect(normalizeAddress('zzz', 'America/New_York')).toBeNull();
  });
});

describe('templates', () => {
  const campaign = {
    honoreeNameHe: 'נפתלי בן יעקב',
    honoreeNameEn: 'Naftali ben Yaakov',
    dedicationType: 'ilui_nishmas',
  } as const;
  const hebrew = /[֐-׿]/;
  const links = { portionUrl: 'https://x.test/m/t', unsubscribeUrl: 'https://x.test/unsubscribe/u' };

  it('ends SMS with the STOP line and keeps Hebrew out when an English name exists', () => {
    const texts = [
      templates.claimConfirmation('sms', { campaign, masechtos: ['Peah', 'Demai'], ...links }),
      templates.invitation('sms', { campaign, organizerName: null, publicUrl: 'https://x.test/c/s', ...links }),
      templates.reminder('sms', {
        campaign,
        daysLeft: 7,
        endDateText: 'January 31',
        portions: [{ masechtos: ['Peah'], portionUrl: links.portionUrl }],
        unsubscribeUrl: links.unsubscribeUrl,
      }),
      templates.campaignComplete('sms', { campaign, dashboardUrl: 'https://x.test/campaigns/1', ...links }),
    ];
    for (const text of texts) {
      expect(text.body.endsWith('Reply STOP to opt out')).toBe(true);
      expect(text.body).not.toMatch(hebrew);
      expect(text.subject).toBeUndefined();
    }
  });

  it('falls back to the Hebrew name in SMS when there is no English one', () => {
    const text = templates.claimConfirmation('sms', {
      campaign: { ...campaign, honoreeNameEn: null },
      masechtos: ['Peah'],
      ...links,
    });
    expect(text.body).toContain('נפתלי בן יעקב');
  });

  it('puts the unsubscribe link in emails', () => {
    const texts = [
      templates.claimConfirmation('email', { campaign, masechtos: ['Peah'], ...links }),
      templates.invitation('email', { campaign, organizerName: 'Yaakov', publicUrl: 'https://x.test/c/s', ...links }),
      templates.reminder('email', {
        campaign,
        daysLeft: 14,
        endDateText: 'January 31',
        portions: [{ masechtos: ['Peah', 'Demai'], portionUrl: links.portionUrl }],
        unsubscribeUrl: links.unsubscribeUrl,
      }),
      templates.campaignComplete('email', { campaign, dashboardUrl: 'https://x.test/campaigns/1', ...links }),
    ];
    for (const text of texts) {
      expect(text.subject).toBeTruthy();
      expect(text.body).toContain(links.unsubscribeUrl);
    }
  });

  it('leaves opt-out wording off code messages', () => {
    const texts = [
      templates.loginCode({ code: '123456' }),
      templates.participantCode('sms', { code: '123456', campaign }),
      templates.participantCode('email', { code: '123456', campaign }),
    ];
    for (const text of texts) {
      expect(text.body).toContain('123456');
      expect(text.body).not.toContain('STOP');
      expect(text.body).not.toContain('unsubscribe');
    }
  });

  it('builds links from APP_URL', async () => {
    const url = await unsubscribeUrl(
      { APP_URL: 'https://chart.example/', TOKEN_SECRET: 's' },
      { channel: 'email', address: 'a@b.co' },
    );
    expect(url.startsWith('https://chart.example/unsubscribe/')).toBe(true);
  });
});

describe('routes', () => {
  it('lists the outbox newest first', async () => {
    await dispatch(env, message({ body: 'first' }));
    await new Promise((r) => setTimeout(r, 5));
    await dispatch(env, message({ body: 'second' }));
    const res = await exports.default.fetch('http://localhost/api/dev/outbox');
    expect(res.status).toBe(200);
    const body = await res.json<{ messages: { body: string; to: string }[] }>();
    expect(body.messages.map((m) => m.body)).toEqual(['second', 'first']);
  });

  it('hides the outbox in production', async () => {
    const { app } = await import('../app');
    const res = await app.request('/api/dev/outbox', {}, { ...env, ENVIRONMENT: 'production' });
    expect(res.status).toBe(404);
  });

  it('shows and confirms an opt-out', async () => {
    const token = await signUnsubscribeToken(env.TOKEN_SECRET, { channel: 'email', address: 'a@b.co' });
    const before = await exports.default.fetch(`http://localhost/api/unsubscribe/${token}`);
    expect(await before.json()).toEqual({ channel: 'email', address: 'a@b.co', optedOut: false });

    const confirm = await exports.default.fetch(`http://localhost/api/unsubscribe/${token}`, { method: 'POST' });
    expect(confirm.status).toBe(200);
    await exports.default.fetch(`http://localhost/api/unsubscribe/${token}`, { method: 'POST' });

    const after = await exports.default.fetch(`http://localhost/api/unsubscribe/${token}`);
    expect(await after.json()).toMatchObject({ optedOut: true });
    expect(await dispatch(env, message({ channel: 'email', to: 'a@b.co' }))).toBe('suppressed');
  });

  it('rejects a bad unsubscribe token', async () => {
    const res = await exports.default.fetch('http://localhost/api/unsubscribe/abc.def');
    expect(res.status).toBe(404);
  });
});

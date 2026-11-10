import { dedicationPhrase, type DedicationType } from '../../shared/dedication';
import type { Channel } from './types';

/**
 * One pure function per event. Each returns the text for the channel it is given.
 *
 * SMS uses the English honoree name when there is one, because a single Hebrew
 * character switches the whole message to short 70-character segments.
 */

export interface Rendered {
  subject?: string;
  body: string;
}

export interface CampaignText {
  honoreeNameHe: string;
  honoreeNameEn: string | null;
  dedicationType: DedicationType;
}

const SMS_OPT_OUT = 'Reply STOP to opt out';
const emailOptOut = (url: string) => `To stop emails about this, open: ${url}`;

function honoree(channel: Channel, campaign: CampaignText): string {
  if (channel === 'sms') return campaign.honoreeNameEn || campaign.honoreeNameHe;
  return campaign.honoreeNameEn ? `${campaign.honoreeNameHe} (${campaign.honoreeNameEn})` : campaign.honoreeNameHe;
}

const dedication = (channel: Channel, campaign: CampaignText) =>
  dedicationPhrase(campaign.dedicationType, honoree(channel, campaign));

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const masechtaWord = (count: number) => (count === 1 ? 'masechta' : 'masechtos');

export function loginCode(data: { code: string }): Rendered {
  return {
    subject: `${data.code} is your login code`,
    body: `Your login code is ${data.code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`,
  };
}

export function participantCode(channel: Channel, data: { code: string; campaign: CampaignText }): Rendered {
  if (channel === 'sms') {
    return { body: `${data.code} is your code to see your mishnayos ${dedication(channel, data.campaign)}.` };
  }
  return {
    subject: `${data.code} is your sign-in code`,
    body: `Your code is ${data.code}.\n\nEnter it to see the mishnayos you took ${dedication(channel, data.campaign)}. It works for 10 minutes.`,
  };
}

export function claimConfirmation(
  channel: Channel,
  data: { campaign: CampaignText; masechtos: string[]; portionUrl: string; unsubscribeUrl: string },
): Rendered {
  const taken = list(data.masechtos);
  // Someone can add a phone or email while holding nothing, and still needs their link.
  if (data.masechtos.length === 0) {
    const text = `Here is your page for the mishnayos ${dedication(channel, data.campaign)}`;
    return channel === 'sms'
      ? { body: `${text}: ${data.portionUrl} ${SMS_OPT_OUT}` }
      : {
          subject: `Your mishnayos ${dedication(channel, data.campaign)}`,
          body: [`${text}:\n${data.portionUrl}`, emailOptOut(data.unsubscribeUrl)].join('\n\n'),
        };
  }
  if (channel === 'sms') {
    return {
      body: `Thank you for taking ${taken} ${dedication(channel, data.campaign)}. Your page: ${data.portionUrl} ${SMS_OPT_OUT}`,
    };
  }
  return {
    subject: `Your mishnayos ${dedication(channel, data.campaign)}`,
    body: [
      `Thank you for taking ${taken} ${dedication(channel, data.campaign)}.`,
      `Your page, where you can mark a masechta finished or give it back:\n${data.portionUrl}`,
      'You will get a reminder before the target date.',
      emailOptOut(data.unsubscribeUrl),
    ].join('\n\n'),
  };
}

export function invitation(
  channel: Channel,
  data: { campaign: CampaignText; organizerName: string | null; publicUrl: string; unsubscribeUrl: string },
): Rendered {
  const from = data.organizerName ? `${data.organizerName} invites you` : 'You are invited';
  if (channel === 'sms') {
    return {
      body: `${from} to take a masechta of mishnayos ${dedication(channel, data.campaign)}. See what is open: ${data.publicUrl} ${SMS_OPT_OUT}`,
    };
  }
  return {
    subject: `Mishnayos ${dedication(channel, data.campaign)}`,
    body: [
      `${from} to take a masechta of mishnayos ${dedication(channel, data.campaign)}.`,
      `One shared chart shows what is still open:\n${data.publicUrl}`,
      emailOptOut(data.unsubscribeUrl),
    ].join('\n\n'),
  };
}

export interface ReminderPortion {
  masechtos: string[];
  portionUrl: string;
}

export function reminder(
  channel: Channel,
  data: {
    campaign: CampaignText;
    daysLeft: number;
    endDateText: string;
    portions: ReminderPortion[];
    unsubscribeUrl: string;
  },
): Rendered {
  const all = data.portions.flatMap((p) => p.masechtos);
  const days = `${data.daysLeft} ${data.daysLeft === 1 ? 'day' : 'days'}`;
  if (channel === 'sms') {
    const links = data.portions.map((p) => p.portionUrl).join(' ');
    return {
      body: `Reminder: ${days} left to finish ${list(all)} ${dedication(channel, data.campaign)}, by ${data.endDateText}. Your page: ${links} ${SMS_OPT_OUT}`,
    };
  }
  const portions = data.portions.map((p) => `${list(p.masechtos)}\n${p.portionUrl}`).join('\n\n');
  return {
    subject: `${days} left: your mishnayos ${dedication(channel, data.campaign)}`,
    body: [
      `There are ${days} left until ${data.endDateText} to finish the ${masechtaWord(all.length)} you took ${dedication(channel, data.campaign)}.`,
      `${portions}`,
      'Open your page to mark a masechta finished, or to give it back so someone else can learn it.',
      emailOptOut(data.unsubscribeUrl),
    ].join('\n\n'),
  };
}

export function campaignComplete(
  channel: Channel,
  data: { campaign: CampaignText; dashboardUrl: string; unsubscribeUrl: string },
): Rendered {
  if (channel === 'sms') {
    return {
      body: `All of Shas Mishnayos has been finished ${dedication(channel, data.campaign)}. ${data.dashboardUrl} ${SMS_OPT_OUT}`,
    };
  }
  return {
    subject: `All of Shas is finished ${dedication(channel, data.campaign)}`,
    body: [
      `All 63 masechtos have been marked finished ${dedication(channel, data.campaign)}.`,
      `See who learned what:\n${data.dashboardUrl}`,
      emailOptOut(data.unsubscribeUrl),
    ].join('\n\n'),
  };
}

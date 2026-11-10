import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { Channel } from '../messaging/types';

export function defaultRegion(timezone: string): CountryCode {
  return timezone === 'Asia/Jerusalem' ? 'IL' : 'US';
}

/** Returns the number in E.164 form, or null when it is not a valid phone number. */
export function normalizePhone(input: string, timezone: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultRegion(timezone));
  return parsed?.isValid() ? parsed.number : null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_SHAPE.test(email) ? email : null;
}

/** Reads a typed phone or email, as used by participant sign-in. */
export function normalizeAddress(input: string, timezone: string): { channel: Channel; address: string } | null {
  if (input.includes('@')) {
    const email = normalizeEmail(input);
    return email ? { channel: 'email', address: email } : null;
  }
  const phone = normalizePhone(input, timezone);
  return phone ? { channel: 'sms', address: phone } : null;
}

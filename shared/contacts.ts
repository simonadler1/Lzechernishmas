/** One pasted line turned into a contact. Phone and email are as typed; the server normalizes them. */
export interface ParsedContact {
  name: string;
  phone?: string;
  email?: string;
}

const EMAIL = /[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]+/;
// A run of digits and phone punctuation holding at least 7 digits.
const PHONE = /[+(]?\d[\d\s().-]{5,}\d/;

/**
 * Reads "name, phone, email" with the phone and email in either order and
 * either one missing. They are recognized by shape, so commas are optional:
 * "Moshe Katz 718-555-0123 moshe@example.com" works too.
 */
export function parseContactLine(line: string): ParsedContact {
  let rest = line;
  const email = rest.match(EMAIL)?.[0];
  if (email) rest = rest.replace(email, ' ');
  const phone = rest.match(PHONE)?.[0];
  if (phone && phone.replace(/\D/g, '').length >= 7) rest = rest.replace(phone, ' ');
  const name = rest
    .replace(/[,;\t<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    name,
    ...(phone && phone.replace(/\D/g, '').length >= 7 ? { phone: phone.trim() } : {}),
    ...(email ? { email } : {}),
  };
}

/** Splits pasted text into its non-empty lines and parses each. */
export function parseContactText(text: string): ParsedContact[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseContactLine);
}

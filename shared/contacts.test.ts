import { describe, expect, it } from 'vitest';
import { parseContactLine, parseContactText } from './contacts';

describe('parseContactLine', () => {
  it('reads name, phone and email in either order', () => {
    expect(parseContactLine('Moshe Katz, 718-555-0123, moshe@example.com')).toEqual({
      name: 'Moshe Katz', phone: '718-555-0123', email: 'moshe@example.com',
    });
    expect(parseContactLine('Moshe Katz, moshe@example.com, (718) 555-0123')).toEqual({
      name: 'Moshe Katz', phone: '(718) 555-0123', email: 'moshe@example.com',
    });
  });

  it('works without commas, with tabs, and with only one contact detail', () => {
    expect(parseContactLine('Dovid Levi 054-555-0123')).toEqual({ name: 'Dovid Levi', phone: '054-555-0123' });
    expect(parseContactLine('Dovid Levi\tdovid@example.com')).toEqual({ name: 'Dovid Levi', email: 'dovid@example.com' });
    expect(parseContactLine('Rabbi Cohen; +1 718 555 0123')).toEqual({ name: 'Rabbi Cohen', phone: '+1 718 555 0123' });
    expect(parseContactLine('Moshe Katz <moshe@example.com>')).toEqual({ name: 'Moshe Katz', email: 'moshe@example.com' });
  });

  it('keeps Hebrew names and leaves short numbers in the name', () => {
    expect(parseContactLine('משה כץ, 0545550123')).toEqual({ name: 'משה כץ', phone: '0545550123' });
    expect(parseContactLine('Apartment 12, a@b.co')).toEqual({ name: 'Apartment 12', email: 'a@b.co' });
  });

  it('returns an empty name or no details for the server to report', () => {
    expect(parseContactLine('718-555-0123')).toEqual({ name: '', phone: '718-555-0123' });
    expect(parseContactLine('Just A Name')).toEqual({ name: 'Just A Name' });
  });
});

describe('parseContactText', () => {
  it('skips blank lines', () => {
    expect(parseContactText('A, a@b.co\n\n  \r\nB, 718-555-0123\n')).toHaveLength(2);
  });
});

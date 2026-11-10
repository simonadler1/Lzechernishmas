import { describe, expect, it } from 'vitest';
import { hebrewDate } from './hebrew-date';

describe('hebrewDate', () => {
  it('converts known dates', () => {
    // Rosh Hashanah 5785 and the first day of Pesach 5783.
    expect(hebrewDate('2024-10-03')).toBe('א׳ תשרי תשפ״ה');
    expect(hebrewDate('2023-04-06')).toBe('ט״ו ניסן תשפ״ג');
  });

  it('returns null for a date that does not exist', () => {
    expect(hebrewDate('2030-02-30')).toBeNull();
    expect(hebrewDate('')).toBeNull();
  });
});

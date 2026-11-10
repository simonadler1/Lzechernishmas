import { describe, expect, it } from 'vitest';
import {
  ALL_MASECHTOS,
  SHAS,
  TOTAL_MASECHTOS,
  TOTAL_PERAKIM,
  compareMasechtos,
  getMasechta,
  isValidMasechta,
  sefariaUrl,
} from './shas';

describe('Shas structure', () => {
  it('has 6 sedarim and 63 masechtos', () => {
    expect(SHAS).toHaveLength(6);
    expect(SHAS.map((s) => s.id)).toEqual(['zeraim', 'moed', 'nashim', 'nezikin', 'kodashim', 'taharos']);
    expect(SHAS.map((s) => s.masechtos.length)).toEqual([11, 12, 7, 10, 11, 12]);
    expect(TOTAL_MASECHTOS).toBe(63);
    expect(ALL_MASECHTOS).toHaveLength(63);
    // 523 is the classic count: Bikkurim with 3 perakim and Avos with 5.
    expect(TOTAL_PERAKIM).toBe(523);
  });

  it('has unique masechta ids', () => {
    expect(new Set(ALL_MASECHTOS.map((m) => m.id)).size).toBe(63);
  });

  it('keeps Shas order in the flat list', () => {
    expect(ALL_MASECHTOS[0]?.id).toBe('berachos');
    expect(ALL_MASECHTOS[62]?.id).toBe('uktzin');
    expect(ALL_MASECHTOS.map((m) => m.index)).toEqual([...Array(63).keys()]);
    expect(['uktzin', 'peah', 'berachos'].sort(compareMasechtos)).toEqual(['berachos', 'peah', 'uktzin']);
  });

  it('finds the masechta Taharos although its seder shares the id', () => {
    const m = getMasechta('taharos');
    expect(m).toMatchObject({ id: 'taharos', en: 'Taharos', perakim: 10, sederId: 'taharos' });
  });

  it('rejects unknown masechtos', () => {
    expect(getMasechta('zeraim')).toBeUndefined();
    expect(isValidMasechta('zeraim')).toBe(false);
    expect(isValidMasechta('not-a-masechta')).toBe(false);
    expect(isValidMasechta(42)).toBe(false);
    expect(isValidMasechta('berachos')).toBe(true);
    expect(() => sefariaUrl('nope')).toThrow();
  });

  it('builds Sefaria links', () => {
    expect(sefariaUrl('berachos')).toBe('https://www.sefaria.org/Mishnah_Berakhot');
    expect(sefariaUrl('avos')).toBe('https://www.sefaria.org/Pirkei_Avot');
  });
});

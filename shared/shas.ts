import data from './shas.json';

export interface Masechta {
  id: string;
  en: string;
  he: string;
  perakim: number;
  /** Sefaria's page name for the masechta, such as `Mishnah_Berakhot`. */
  sefaria: string;
  sederId: string;
  /** Position in all of Shas, starting at 0. */
  index: number;
}

export interface Seder {
  id: string;
  en: string;
  he: string;
  masechtos: Masechta[];
}

let position = 0;

export const SHAS: readonly Seder[] = data.map((seder) => ({
  id: seder.id,
  en: seder.en,
  he: seder.he,
  masechtos: seder.masechtos.map((m) => ({ ...m, sederId: seder.id, index: position++ })),
}));

export const ALL_MASECHTOS: readonly Masechta[] = SHAS.flatMap((seder) => seder.masechtos);

export const TOTAL_MASECHTOS = ALL_MASECHTOS.length;

export const TOTAL_PERAKIM = ALL_MASECHTOS.reduce((sum, m) => sum + m.perakim, 0);

// Keyed by masechta id only. Seder ids live in a separate namespace, so the
// masechta Taharos is found even though its seder is also called `taharos`.
const byId = new Map(ALL_MASECHTOS.map((m) => [m.id, m]));

export function getMasechta(id: string): Masechta | undefined {
  return byId.get(id);
}

export function isValidMasechta(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

export function sefariaUrl(masechtaId: string): string {
  const masechta = byId.get(masechtaId);
  if (!masechta) throw new Error(`Unknown masechta: ${masechtaId}`);
  return `https://www.sefaria.org/${masechta.sefaria}`;
}

/** Sorts masechta ids into Shas order. Unknown ids go last. */
export function compareMasechtos(a: string, b: string): number {
  return (byId.get(a)?.index ?? Infinity) - (byId.get(b)?.index ?? Infinity);
}

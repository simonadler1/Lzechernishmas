import { HDate } from '@hebcal/hdate';
import { isRealDate } from './dates';

/**
 * The Hebrew date of a civil date's daytime, such as "כ״ז שבט תש״צ".
 * Returns null for anything that is not a real `YYYY-MM-DD` date.
 */
export function hebrewDate(date: string): string | null {
  if (!isRealDate(date)) return null;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new HDate(new Date(year, month - 1, day)).renderGematriya(true);
}

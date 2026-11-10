import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { addDays, dayOfWeek } from '../../shared/dates';

/** Israel keeps one day of Yom Tov where the diaspora keeps two. */
export const isIsrael = (timezone: string) => timezone === 'Asia/Jerusalem';

/**
 * True on days when no message may go out: Shabbos, and Yom Tov as kept in
 * that place. Chol Hamoed and fast days are ordinary days for this purpose.
 * Messages go out near 10:00 in the morning, so the civil date is enough and
 * no zmanim are needed.
 */
export function isHeldDate(localDate: string, inIsrael: boolean): boolean {
  if (dayOfWeek(localDate) === 6) return true;
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const holidays = HebrewCalendar.getHolidaysOnDate(new HDate(new Date(year, month - 1, day)), inIsrael) ?? [];
  return holidays.some((holiday) => (holiday.getFlags() & flags.CHAG) !== 0);
}

/** The first day on or after `localDate` when a message may go out. */
export function nextPermittedDate(localDate: string, inIsrael: boolean): string {
  let date = localDate;
  // Shabbos and Yom Tov never run longer than three days together.
  for (let i = 0; i < 10 && isHeldDate(date, inIsrael); i++) date = addDays(date, 1);
  return date;
}

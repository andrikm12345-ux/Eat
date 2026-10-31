import { daysBetween, parseLocalDate } from './dates';
import type { LocalDate } from './types';

/**
 * Weekly measurement reminder: due on the chosen weekday (0 = Sunday) when the last
 * measurement is at least 7 days old (or there is none); after a missed weekday it
 * stays due until a measurement is made.
 */
export function measurementDue(
  today: LocalDate,
  weekday: number,
  lastMeasurement: LocalDate | null,
): boolean {
  if (!lastMeasurement) return parseLocalDate(today).getDay() === weekday;
  const age = daysBetween(lastMeasurement, today);
  if (age < 7) return false;
  if (age >= 8) return true;
  return parseLocalDate(today).getDay() === weekday;
}

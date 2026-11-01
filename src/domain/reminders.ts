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

/** After 11:00 with nothing logged at all today → "Сегодня ещё ничего не записано". */
export function nothingLoggedYet(nowMin: number, todayTimes: readonly string[]): boolean {
  return nowMin >= 11 * 60 && todayTimes.length === 0;
}

/** Days since the last weigh-in when ≥ 3 (else null; null without any weigh-ins). */
export function weighOverdue(last: LocalDate | null, today: LocalDate): number | null {
  if (!last) return null;
  const d = daysBetween(last, today);
  return d >= 3 ? d : null;
}

/** Backup reminder every 7 days (first one 7 days after the start of use). */
export function backupDue(
  lastBackup: LocalDate | null,
  firstUse: LocalDate | null,
  today: LocalDate,
): boolean {
  const ref = lastBackup ?? firstUse;
  return ref !== null && daysBetween(ref, today) >= 7;
}

import { addDays as addDaysFns, differenceInCalendarDays, format, isValid, parse } from 'date-fns';
import type { LocalDate } from './types';

const DATE_FMT = 'yyyy-MM-dd';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day of a Date in the device time zone. */
export function toLocalDate(d: Date): LocalDate {
  return format(d, DATE_FMT);
}

/** Local `HH:mm` of a Date. */
export function toLocalTime(d: Date): string {
  return format(d, 'HH:mm');
}

/** Parses `YYYY-MM-DD` as local midnight. Throws on invalid input. */
export function parseLocalDate(s: LocalDate): Date {
  const d = DATE_RE.test(s) ? parse(s, DATE_FMT, new Date(2000, 0, 1)) : new Date(NaN);
  if (!isValid(d)) throw new Error(`Invalid local date: ${s}`);
  return d;
}

export function isLocalDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  return isValid(parse(s, DATE_FMT, new Date(2000, 0, 1)));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(addDaysFns(parseLocalDate(date), days));
}

/** Whole calendar days from `a` to `b` (b − a). DST-safe. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return differenceInCalendarDays(parseLocalDate(b), parseLocalDate(a));
}

/** Full years of age on a given day. */
export function ageOn(birthDate: LocalDate, on: LocalDate): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

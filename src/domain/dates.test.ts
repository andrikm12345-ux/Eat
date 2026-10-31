import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  daysBetween,
  formatDateRu,
  isLocalDate,
  parseLocalDate,
  toLocalDate,
  toLocalTime,
} from './dates';

describe('dates', () => {
  it('formats local date and time', () => {
    const d = new Date(2026, 0, 5, 7, 3);
    expect(toLocalDate(d)).toBe('2026-01-05');
    expect(toLocalTime(d)).toBe('07:03');
  });

  it('parses local dates and rejects invalid ones', () => {
    const d = parseLocalDate('2026-03-29');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 29, 0]);
    expect(() => parseLocalDate('2026-02-30')).toThrow();
    expect(() => parseLocalDate('29.03.2026')).toThrow();
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2025-02-29')).toBe(false);
    expect(isLocalDate('2025-2-1')).toBe(false);
  });

  it('adds days across month/year/DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('counts calendar days', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7);
    expect(daysBetween('2026-03-27', '2026-03-31')).toBe(4);
  });

  it('computes age in full years', () => {
    expect(ageOn('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageOn('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageOn('1990-06-15', '2026-05-20')).toBe(35);
    expect(ageOn('1990-06-15', '2026-07-01')).toBe(36);
  });

  it('formats Russian dates', () => {
    expect(formatDateRu('2026-03-05')).toBe('5 марта 2026');
    expect(formatDateRu('2026-03-05', 'EEEEEE, d MMM')).toBe('чт, 5 мар.');
  });
});

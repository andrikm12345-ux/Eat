import { describe, expect, it } from 'vitest';
import { backupDue, measurementDue, nothingLoggedYet, weighOverdue } from './reminders';

describe('measurementDue', () => {
  // 2026-03-01 is a Sunday.
  it('due on the chosen weekday without history', () => {
    expect(measurementDue('2026-03-01', 0, null)).toBe(true);
    expect(measurementDue('2026-03-02', 0, null)).toBe(false);
  });
  it('waits 7 days after a measurement', () => {
    expect(measurementDue('2026-03-01', 0, '2026-02-25')).toBe(false);
    expect(measurementDue('2026-03-01', 0, '2026-02-22')).toBe(true);
    expect(measurementDue('2026-03-02', 0, '2026-02-23')).toBe(false);
    expect(measurementDue('2026-03-03', 0, '2026-02-22')).toBe(true);
  });
});

describe('other reminders', () => {
  it('nothing logged yet', () => {
    expect(nothingLoggedYet(10 * 60, [])).toBe(false);
    expect(nothingLoggedYet(11 * 60, [])).toBe(true);
    // Any entry today, at any time, ends the reminder.
    expect(nothingLoggedYet(12 * 60, ['12:30'])).toBe(false);
    expect(nothingLoggedYet(12 * 60, ['08:10'])).toBe(false);
  });
  it('weigh overdue', () => {
    expect(weighOverdue(null, '2026-03-10')).toBeNull();
    expect(weighOverdue('2026-03-08', '2026-03-10')).toBeNull();
    expect(weighOverdue('2026-03-07', '2026-03-10')).toBe(3);
  });
  it('backup due', () => {
    expect(backupDue(null, null, '2026-03-10')).toBe(false);
    expect(backupDue(null, '2026-03-05', '2026-03-10')).toBe(false);
    expect(backupDue(null, '2026-03-03', '2026-03-10')).toBe(true);
    expect(backupDue('2026-03-08', '2026-01-01', '2026-03-10')).toBe(false);
  });
});

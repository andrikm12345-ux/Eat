import { describe, expect, it } from 'vitest';
import { measurementDue } from './reminders';

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

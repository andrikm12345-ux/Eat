import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { direction, forecastDate, goalProgress, niceTicks, trendRatePerWeek } from './progress';
import { computeTrend } from './weightTrend';

describe('progress', () => {
  it('goal progress', () => {
    expect(goalProgress(90, 85, 80)).toBe(0.5);
    expect(goalProgress(60, 62, 65)).toBeCloseTo(0.4);
    expect(goalProgress(80, 81, 70)).toBeCloseTo(-0.1);
    expect(goalProgress(80, 79, 80)).toBeNull();
  });

  it('trend rate per week', () => {
    const pts = computeTrend(
      Array.from({ length: 60 }, (_, i) => ({ date: addDays('2026-01-01', i), kg: 90 - i * 0.1 })),
    );
    const r = trendRatePerWeek(pts, '2026-03-01');
    expect(r).toBeLessThan(-0.5);
    expect(r).toBeGreaterThan(-0.75);
    expect(trendRatePerWeek(pts, '2025-12-01')).toBeNull();
    // only 9 days of history → shorter window
    expect(trendRatePerWeek(pts, '2026-01-10')).not.toBeNull();
    expect(trendRatePerWeek(pts, '2026-01-05')).toBeNull();
  });

  it('forecast date', () => {
    expect(forecastDate(85, 80, -0.5, '2026-01-01')).toBe('2026-03-12');
    expect(forecastDate(85, 80, 0.2, '2026-01-01')).toBeNull();
    expect(forecastDate(85, 80, 0, '2026-01-01')).toBeNull();
    expect(forecastDate(85, 80, null, '2026-01-01')).toBeNull();
    expect(forecastDate(80.02, 80, -0.5, '2026-01-01')).toBe('2026-01-01');
    expect(forecastDate(85, 80, -0.01, '2026-01-01')).toBeNull();
    expect(forecastDate(60, 65, 0.25, '2026-01-01')).toBe('2026-05-21');
  });

  it('nice ticks', () => {
    expect(niceTicks(78.3, 82.9)).toEqual([80, 82]);
    expect(niceTicks(78.3, 82.9, 8)).toEqual([79, 80, 81, 82]);
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('direction', () => {
    expect(direction(-0.3)).toBe('down');
    expect(direction(0.3)).toBe('up');
    expect(direction(0.05)).toBe('flat');
    expect(direction(null)).toBe('flat');
    expect(direction(undefined)).toBe('flat');
  });
});

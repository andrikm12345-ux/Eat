import { addDays } from './dates';
import type { LocalDate } from './types';
import { trendOn, type TrendPoint } from './weightTrend';

/** Share of the way from start to target (may be < 0 or > 1). `null` if start = target. */
export function goalProgress(startKg: number, nowKg: number, targetKg: number): number | null {
  const total = startKg - targetKg;
  if (Math.abs(total) < 1e-9) return null;
  return (startKg - nowKg) / total;
}

/** Trend speed in kg/week over the last `days` days ending on `date`. */
export function trendRatePerWeek(
  points: readonly TrendPoint[],
  date: LocalDate,
  days = 14,
): number | null {
  const end = trendOn(points, date);
  if (end === undefined) return null;
  // Use the longest available window up to `days`.
  for (let d = days; d >= 7; d--) {
    const start = trendOn(points, addDays(date, -d));
    if (start !== undefined) return ((end - start) / d) * 7;
  }
  return null;
}

/**
 * Estimated date of reaching `targetKg` at the current speed. `null` when not moving
 * toward the target (or too slowly: > 3 years).
 */
export function forecastDate(
  nowKg: number,
  targetKg: number,
  ratePerWeek: number | null,
  today: LocalDate,
): LocalDate | null {
  if (ratePerWeek === null) return null;
  const diff = targetKg - nowKg;
  if (Math.abs(diff) < 0.05) return today;
  if (Math.sign(diff) !== Math.sign(ratePerWeek) || Math.abs(ratePerWeek) < 1e-6) return null;
  const days = Math.ceil((diff / ratePerWeek) * 7);
  return days > 3 * 365 ? null : addDays(today, days);
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) as number;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
    out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Weight direction for the arrow: 'down' | 'up' | 'flat' (|Δ| < 0.1 kg). */
export function direction(delta: number | null | undefined): 'down' | 'up' | 'flat' {
  if (delta === null || delta === undefined || Math.abs(delta) < 0.1) return 'flat';
  return delta < 0 ? 'down' : 'up';
}

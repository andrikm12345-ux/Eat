import { addDays, daysBetween } from './dates';
import type { LocalDate, Weight } from './types';

export type DailyWeight = { date: LocalDate; kg: number };
export type TrendPoint = DailyWeight & { trend: number };

/** Which weigh-in represents a day when there are several. */
export type DailyPick = 'first' | 'min';

export const DEFAULT_ALPHA = 0.1;
export const ALPHA_MIN = 0.05;
export const ALPHA_MAX = 0.25;
export const MAX_EXTRAPOLATION_DAYS = 7;

/** One value per day (first by time, or the minimum), sorted by date, ignoring deleted. */
export function pickDailyWeights(
  weights: readonly Pick<Weight, 'date' | 'time' | 'kg' | 'deletedAt'>[],
  pick: DailyPick = 'first',
): DailyWeight[] {
  const byDay = new Map<LocalDate, { time: string; kg: number }>();
  for (const w of weights) {
    if (w.deletedAt || !(w.kg > 0)) continue;
    const cur = byDay.get(w.date);
    const better =
      !cur ||
      (pick === 'first'
        ? w.time < cur.time || (w.time === cur.time && w.kg < cur.kg)
        : w.kg < cur.kg);
    if (better) byDay.set(w.date, { time: w.time, kg: w.kg });
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, kg: v.kg }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Gap-aware EMA. trend₀ = first weight; for a weight `w` Δ days later:
 * α_eff = 1 − (1 − α)^Δ, trend = prev + α_eff · (w − prev).
 * `daily` must be sorted by date with unique days (see pickDailyWeights).
 */
export function computeTrend(daily: readonly DailyWeight[], alpha = DEFAULT_ALPHA): TrendPoint[] {
  const a = Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, alpha));
  const out: TrendPoint[] = [];
  let prev: TrendPoint | undefined;
  for (const d of daily) {
    let trend: number;
    if (!prev) {
      trend = d.kg;
    } else {
      const delta = Math.max(1, daysBetween(prev.date, d.date));
      const aEff = 1 - Math.pow(1 - a, delta);
      trend = prev.trend + aEff * (d.kg - prev.trend);
    }
    prev = { date: d.date, kg: d.kg, trend };
    out.push(prev);
  }
  return out;
}

/**
 * Trend value on any day: exact on weigh-in days, linear interpolation between
 * weigh-ins, extrapolation ≤ 7 days after the last weigh-in using the slope of the
 * trend over the preceding (up to) 7 days. `undefined` outside that range.
 */
export function trendOn(points: readonly TrendPoint[], date: LocalDate): number | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || date < first.date) return undefined;
  if (date > last.date) {
    const ahead = daysBetween(last.date, date);
    if (ahead > MAX_EXTRAPOLATION_DAYS) return undefined;
    return last.trend + trendSlopePerDay(first, last, points) * ahead;
  }
  return interpolate(points, date);
}

/** Change of the trend over `days` days ending on `date` (e.g. "за 7 дней"). */
export function trendChange(
  points: readonly TrendPoint[],
  date: LocalDate,
  days = 7,
): number | undefined {
  const end = trendOn(points, date);
  const start = trendOn(points, addDays(date, -days));
  if (end === undefined || start === undefined) return undefined;
  return end - start;
}

/** Day-by-day series for charts: raw weight (if weighed) and trend (if defined). */
export function trendSeries(
  points: readonly TrendPoint[],
  from: LocalDate,
  to: LocalDate,
): { date: LocalDate; kg: number | null; trend: number | null }[] {
  const raw = new Map(points.map((p) => [p.date, p.kg]));
  const out: { date: LocalDate; kg: number | null; trend: number | null }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({ date: d, kg: raw.get(d) ?? null, trend: trendOn(points, d) ?? null });
  }
  return out;
}

function interpolate(points: readonly TrendPoint[], date: LocalDate): number {
  // Binary search for the last point with p.date ≤ date (callers guarantee date ≥ first).
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((points[mid] as TrendPoint).date <= date) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo] as TrendPoint;
  const b = points[lo + 1];
  if (a.date === date || !b) return a.trend;
  const t = daysBetween(a.date, date) / daysBetween(a.date, b.date);
  return a.trend + t * (b.trend - a.trend);
}

function trendSlopePerDay(first: TrendPoint, last: TrendPoint, points: readonly TrendPoint[]) {
  const span = Math.min(MAX_EXTRAPOLATION_DAYS, daysBetween(first.date, last.date));
  if (span === 0) return 0;
  const start = interpolate(points, addDays(last.date, -span));
  return (last.trend - start) / span;
}

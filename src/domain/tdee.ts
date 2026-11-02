import { addDays, daysBetween } from './dates';
import type { GoalType, LocalDate } from './types';
import { trendOn, type TrendPoint } from './weightTrend';

export const TDEE_DEFAULTS = {
  /** Window length in days (14–28). */
  windowDays: 21,
  /** kcal per kg of body mass change. */
  rho: 7700,
  /** ρ multiplier during the first 14 days of a new regime (water, glycogen). */
  earlyRhoFactor: 0.5,
  earlyPhaseDays: 14,
  minValidShare: 0.6,
  minWeighIns: 4,
  /** Days at the start that use TDEE₀ only. */
  warmupDays: 7,
  maxDailyChange: 75,
  confidenceDecay: 0.05,
  /** Base smoothing gain (× validShare). */
  gain: 0.1,
};

export type TdeeParams = typeof TDEE_DEFAULTS;

export type DayInput = {
  kcal: number;
  /** An old manual "day is full" mark; such a day counts even when nothing is logged. */
  complete: boolean;
  excluded: boolean;
};

export type TdeeInput = {
  /** Per-day data (missing days = nothing logged). */
  days: ReadonlyMap<LocalDate, DayInput>;
  /** Daily weights (one per day). */
  weights: ReadonlyMap<LocalDate, number>;
  /** EMA trend (for the reported trend weight). */
  trend: readonly TrendPoint[];
  /** First day of tracking (onboarding / first entry). */
  start: LocalDate;
  /** Starting estimate BMR × PAL. */
  tdee0: number;
  bmr: number;
  /** Days on which a new regime began (start, lose↔gain switches). */
  regimeStarts: readonly LocalDate[];
};

export type TdeeRow = {
  date: LocalDate;
  tdee: number;
  confidence: number;
  intakeAvg: number;
  windowDays: number;
  trendKg: number;
  validShare: number;
  lowData: boolean;
  /** Raw observed value (before smoothing), when computable. */
  observed: number | null;
  warnings: ('clampedLow' | 'clampedHigh')[];
};

/**
 * A day counts as it was recorded: any day with something logged is used with its real
 * numbers (no threshold). A day with nothing logged is unknown and is skipped, unless it
 * was marked complete before (a recorded empty day). Paused days never count.
 */
export function isValidDay(d: DayInput | undefined): boolean {
  if (!d || d.excluded) return false;
  return d.complete || d.kcal > 0;
}

/** Days that start a new regime: the first goal and every lose↔gain switch (maintain keeps the direction). */
export function regimeStartsFromGoals(
  goals: readonly { validFrom: LocalDate; type: GoalType }[],
): LocalDate[] {
  const sorted = [...goals].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const out: LocalDate[] = [];
  let lastDir: GoalType | null = null;
  sorted.forEach((g, i) => {
    if (i === 0) out.push(g.validFrom);
    if (g.type === 'maintain') return;
    if (lastDir !== null && g.type !== lastDir) out.push(g.validFrom);
    lastDir = g.type;
  });
  return out;
}

/**
 * Adaptive TDEE for every day from `input.start` to `to` (inclusive). Each day uses the
 * window of N days that ends the day before ("expenditure = intake − change in stores").
 */
export function computeTdeeSeries(
  input: TdeeInput,
  to: LocalDate,
  params: Partial<TdeeParams> = {},
): TdeeRow[] {
  const p = { ...TDEE_DEFAULTS, ...params };
  const N = Math.min(28, Math.max(14, Math.round(p.windowDays)));
  const lo = input.bmr * 1.0;
  const hi = input.bmr * 2.5;
  const rows: TdeeRow[] = [];
  let prevTdee = input.tdee0;
  let prevConf = 0;
  let validTotal = 0;
  let updates = 0;

  for (let d = input.start; d <= to; d = addDays(d, 1)) {
    const yesterday = addDays(d, -1);
    if (yesterday >= input.start && isValidDay(input.days.get(yesterday))) validTotal++;
    const warnings: TdeeRow['warnings'] = [];

    // Window [d−N, d−1], excluding paused days.
    let considered = 0;
    let valid = 0;
    let intakeSum = 0;
    let weighs = 0;
    for (let i = N; i >= 1; i--) {
      const day = addDays(d, -i);
      if (day < input.start) continue;
      const info = input.days.get(day);
      if (input.weights.has(day)) weighs++;
      if (info?.excluded) continue;
      considered++;
      if (isValidDay(info)) {
        valid++;
        intakeSum += (info as DayInput).kcal;
      }
    }
    const validShare = considered ? valid / considered : 0;
    const intakeAvg = valid ? intakeSum / valid : 0;
    // Change in stores over the window: slope of a least-squares line through the raw
    // weigh-ins of the window × window length. Unlike the EMA difference it has no
    // start-up lag, so a wrong TDEE₀ is corrected within weeks (see simulation test).
    const fit = windowSlope(input.weights, d, N);
    const trendKg = trendOn(input.trend, d) ?? trendOn(input.trend, yesterday) ?? 0;

    let tdee: number;
    let confidence: number;
    let observed: number | null = null;
    const enough = validShare >= p.minValidShare && weighs >= p.minWeighIns && fit !== null;

    if (daysBetween(input.start, d) < p.warmupDays) {
      tdee = input.tdee0;
      confidence = enough ? Math.min(1, validTotal / 28) * validShare : 0;
    } else if (!enough) {
      tdee = prevTdee;
      confidence = Math.max(0, prevConf - p.confidenceDecay);
    } else {
      const regimeStart =
        [...input.regimeStarts]
          .filter((r) => r <= d)
          .sort()
          .at(-1) ?? input.start;
      const early = daysBetween(regimeStart, d) < p.earlyPhaseDays;
      const rho = p.rho * (early ? p.earlyRhoFactor : 1);
      // energyChangePerDay = ΔtrendKg · ρ / N  with ΔtrendKg = slope · N.
      observed = intakeAvg - (fit as number) * rho;
      // Gain: running mean of observations at first (1/(n+2)), settling to 0.1 × validShare,
      // so a wrong starting estimate is corrected quickly while later noise stays damped.
      const k = Math.max(p.gain, 1 / (updates + 2)) * validShare;
      updates++;
      const step = Math.max(
        -p.maxDailyChange,
        Math.min(p.maxDailyChange, k * (observed - prevTdee)),
      );
      tdee = prevTdee + step;
      confidence = Math.min(1, validTotal / 28) * validShare;
    }
    if (tdee < lo) {
      tdee = lo;
      warnings.push('clampedLow');
    } else if (tdee > hi) {
      tdee = hi;
      warnings.push('clampedHigh');
    }

    rows.push({
      date: d,
      tdee,
      confidence,
      intakeAvg,
      windowDays: N,
      trendKg,
      validShare,
      lowData: !enough,
      observed,
      warnings,
    });
    prevTdee = tdee;
    prevConf = confidence;
  }
  return rows;
}

/** Least-squares slope (kg/day) of weigh-ins in [d−N, d−1]; null with < 2 distinct days. */
export function windowSlope(
  weights: ReadonlyMap<LocalDate, number>,
  d: LocalDate,
  N: number,
): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = N; i >= 1; i--) {
    const kg = weights.get(addDays(d, -i));
    if (kg !== undefined) {
      xs.push(-i);
      ys.push(kg);
    }
  }
  if (xs.length < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * ((ys[i] as number) - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}

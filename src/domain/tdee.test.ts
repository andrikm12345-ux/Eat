import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  computeTdeeSeries,
  isValidDay,
  regimeStartsFromGoals,
  type DayInput,
  type TdeeInput,
} from './tdee';
import { computeTrend } from './weightTrend';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = '2026-01-01';

/** Synthetic user: eats `intake`, burns `trueTdee`, weight noise ±noise kg. */
function simulate(opts: {
  days: number;
  trueTdee: number;
  intake: number;
  noise: number;
  seed: number;
  skipDay?: (i: number) => boolean;
  skipWeigh?: (i: number) => boolean;
  tdee0?: number;
}): TdeeInput {
  const r = rng(opts.seed);
  const days = new Map<string, DayInput>() as Map<string, DayInput>;
  const weights: { date: string; kg: number }[] = [];
  let w = 85;
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(START, i);
    const logged = !opts.skipDay?.(i);
    days.set(date, {
      kcal: logged ? opts.intake : 0,
      goalKcal: 2200,
      complete: logged,
      excluded: false,
    });
    if (!opts.skipWeigh?.(i)) weights.push({ date, kg: w + (r() * 2 - 1) * opts.noise });
    w += (opts.intake - opts.trueTdee) / 7700;
  }
  return {
    days,
    weights: new Map(weights.map((x) => [x.date, x.kg])),
    trend: computeTrend(weights),
    start: START,
    tdee0: opts.tdee0 ?? 2200,
    bmr: 1800,
    regimeStarts: [START],
  };
}

describe('adaptive TDEE', () => {
  it('converges: true 2600, start 2200, noise ±0.8 kg → error < 150 kcal after 28 days', () => {
    // Noise-free: deterministic bound.
    const clean = computeTdeeSeries(
      simulate({ days: 29, trueTdee: 2600, intake: 2200, noise: 0, seed: 1 }),
      addDays(START, 28),
    );
    expect(Math.abs(clean[28]!.tdee - 2600)).toBeLessThan(150);
    // With ±0.8 kg uniform noise a hard bound for every realization is impossible (even a perfect
    // fit of 28 days has σ ≈ 85 kcal), so the criterion is checked statistically over 200 runs.
    const errors: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rows = computeTdeeSeries(
        simulate({ days: 29, trueTdee: 2600, intake: 2200, noise: 0.8, seed }),
        addDays(START, 28),
      );
      errors.push(Math.abs(rows[28]!.tdee - 2600));
    }
    errors.sort((a, b) => a - b);
    expect(errors[100]).toBeLessThan(100); // median
    expect(errors.filter((e) => e < 150).length / errors.length).toBeGreaterThan(0.85);
  }, 30_000); // 200 simulations; slower under coverage instrumentation

  it('uses TDEE₀ for the first 7 days and limits changes to ±75 kcal/day', () => {
    const input = simulate({ days: 40, trueTdee: 3400, intake: 2200, noise: 0.3, seed: 7 });
    const rows = computeTdeeSeries(input, addDays(START, 39));
    expect(rows.slice(0, 7).every((x) => x.tdee === 2200)).toBe(true);
    for (let i = 1; i < rows.length; i++)
      expect(Math.abs(rows[i]!.tdee - rows[i - 1]!.tdee)).toBeLessThanOrEqual(75 + 1e-9);
  });

  it('carries the estimate over and decays confidence when data is missing', () => {
    // Logged and weighed for 30 days, then nothing for 10 days.
    const input = simulate({
      days: 40,
      trueTdee: 2600,
      intake: 2200,
      noise: 0.3,
      seed: 3,
      skipDay: (i) => i >= 30,
      skipWeigh: (i) => i >= 30,
    });
    const rows = computeTdeeSeries(input, addDays(START, 45));
    const at = (i: number) => rows[i]!;
    expect(at(30).lowData).toBe(false);
    const lowIdx = rows.findIndex((x, i) => i > 30 && x.lowData);
    expect(lowIdx).toBeGreaterThan(30);
    expect(at(lowIdx).tdee).toBe(at(lowIdx - 1).tdee);
    expect(at(lowIdx).confidence).toBeCloseTo(Math.max(0, at(lowIdx - 1).confidence - 0.05));
    expect(at(45).confidence).toBeLessThan(at(30).confidence);
    expect(Number.isFinite(at(45).tdee)).toBe(true);
  });

  it('works with gaps: every 3rd day unlogged, weighing every other day', () => {
    const input = simulate({
      days: 50,
      trueTdee: 2500,
      intake: 2100,
      noise: 0.5,
      seed: 11,
      skipDay: (i) => i % 3 === 2,
      skipWeigh: (i) => i % 2 === 1,
    });
    const rows = computeTdeeSeries(input, addDays(START, 49));
    expect(Math.abs(rows[49]!.tdee - 2500)).toBeLessThan(200);
    expect(rows[49]!.confidence).toBeGreaterThan(0);
    expect(rows[49]!.confidence).toBeLessThan(1);
  });

  it('clamps to [BMR, 2.5 × BMR]', () => {
    const low = simulate({
      days: 60,
      trueTdee: 1000,
      intake: 1000,
      noise: 0,
      seed: 1,
      tdee0: 1000,
    });
    expect(
      computeTdeeSeries(low, addDays(START, 59)).every(
        (r) => r.tdee >= 1800 && (r.tdee > 1800 || r.warnings.includes('clampedLow')),
      ),
    ).toBe(true);
    const high = simulate({
      days: 60,
      trueTdee: 5000,
      intake: 5000,
      noise: 0,
      seed: 1,
      tdee0: 5000,
    });
    const hr = computeTdeeSeries(high, addDays(START, 59));
    expect(hr.at(-1)!.tdee).toBe(4500);
    expect(hr.at(-1)!.warnings).toEqual(['clampedHigh']);
  });

  it('excluded (paused) days are left out of the window', () => {
    const input = simulate({ days: 40, trueTdee: 2600, intake: 2200, noise: 0.2, seed: 5 });
    for (let i = 20; i < 27; i++) {
      const d = addDays(START, i);
      (input.days as Map<string, DayInput>).set(d, {
        kcal: 5000,
        goalKcal: 2200,
        complete: true,
        excluded: true,
      });
    }
    const paused = computeTdeeSeries(input, addDays(START, 39));
    const r = paused[30]!;
    expect(r.intakeAvg).toBe(2200);
  });

  it('early phase halves ρ after a regime start', () => {
    const base = simulate({ days: 30, trueTdee: 2600, intake: 2200, noise: 0, seed: 1 });
    const early = computeTdeeSeries(base, addDays(START, 29));
    const late = computeTdeeSeries({ ...base, regimeStarts: ['2025-01-01'] }, addDays(START, 29));
    // Day 10: inside the early phase → observed expenditure is lower (less energy attributed to weight change).
    expect(early[10]!.observed!).toBeLessThan(late[10]!.observed!);
    // No regime list → tracking start is the regime start.
    expect(
      computeTdeeSeries({ ...base, regimeStarts: [] }, addDays(START, 29))[10]!.observed,
    ).toBeCloseTo(early[10]!.observed!);
    // Day 20: both outside the early phase.
    expect(early[20]!.observed).toBeCloseTo(late[20]!.observed!);
  });

  it('windowDays is clamped to 14–28', () => {
    const input = simulate({ days: 20, trueTdee: 2600, intake: 2200, noise: 0, seed: 1 });
    expect(computeTdeeSeries(input, addDays(START, 19), { windowDays: 5 })[19]!.windowDays).toBe(
      14,
    );
    expect(computeTdeeSeries(input, addDays(START, 19), { windowDays: 60 })[19]!.windowDays).toBe(
      28,
    );
  });
});

describe('helpers', () => {
  it('valid days', () => {
    expect(isValidDay(undefined)).toBe(false);
    expect(isValidDay({ kcal: 0, complete: true, excluded: false })).toBe(true);
    expect(isValidDay({ kcal: 3000, complete: true, excluded: true })).toBe(false);
    expect(isValidDay({ kcal: 1100, goalKcal: 2200, complete: false, excluded: false })).toBe(true);
    expect(isValidDay({ kcal: 1000, goalKcal: 2200, complete: false, excluded: false })).toBe(
      false,
    );
    expect(isValidDay({ kcal: 1000, complete: false, excluded: false })).toBe(false);
  });
  it('regime starts', () => {
    expect(
      regimeStartsFromGoals([
        { validFrom: '2026-03-01', type: 'maintain' },
        { validFrom: '2026-01-01', type: 'lose' },
        { validFrom: '2026-02-01', type: 'lose' },
        { validFrom: '2026-04-01', type: 'gain' },
        { validFrom: '2026-05-01', type: 'gain' },
      ]),
    ).toEqual(['2026-01-01', '2026-04-01']);
    expect(regimeStartsFromGoals([])).toEqual([]);
  });
});

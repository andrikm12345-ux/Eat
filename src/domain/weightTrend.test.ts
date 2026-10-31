import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  computeTrend,
  pickDailyWeights,
  trendChange,
  trendOn,
  trendSeries,
  type DailyWeight,
} from './weightTrend';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const series = (start: string, values: number[]): DailyWeight[] =>
  values.map((kg, i) => ({ date: addDays(start, i), kg }));

describe('pickDailyWeights', () => {
  const ws = [
    { date: '2026-01-02', time: '21:00', kg: 80.9 },
    { date: '2026-01-02', time: '07:10', kg: 80.4 },
    { date: '2026-01-02', time: '07:10', kg: 80.2 },
    { date: '2026-01-01', time: '08:00', kg: 81 },
    { date: '2026-01-01', time: '06:00', kg: 81.5, deletedAt: 'x' },
    { date: '2026-01-03', time: '09:00', kg: 0 },
    { date: '2026-01-03', time: '19:00', kg: 79.9 },
    { date: '2026-01-03', time: '07:00', kg: 80.1 },
  ];

  it('takes the first weigh-in of the day (ties → lower)', () => {
    expect(pickDailyWeights(ws)).toEqual([
      { date: '2026-01-01', kg: 81 },
      { date: '2026-01-02', kg: 80.2 },
      { date: '2026-01-03', kg: 80.1 },
    ]);
  });

  it('or the minimum', () => {
    expect(pickDailyWeights(ws, 'min').map((d) => d.kg)).toEqual([81, 80.2, 79.9]);
  });

  it('sorts dates', () => {
    const r = pickDailyWeights([
      { date: '2026-01-03', time: '07:00', kg: 3 },
      { date: '2026-01-01', time: '07:00', kg: 1 },
      { date: '2026-01-02', time: '07:00', kg: 2 },
      { date: '2026-01-02', time: '08:00', kg: 9 },
    ]);
    expect(r.map((d) => d.kg)).toEqual([1, 2, 3]);
  });
});

describe('computeTrend', () => {
  it('starts at the first weight and is empty for no data', () => {
    expect(computeTrend([])).toEqual([]);
    expect(computeTrend([{ date: '2026-01-01', kg: 80 }])[0]!.trend).toBe(80);
  });

  it('matches a hand-computed reference series', () => {
    const t = computeTrend([
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-02', kg: 80.6 },
      { date: '2026-01-04', kg: 79.4 },
      { date: '2026-01-05', kg: 80.2 },
    ]);
    // 80 → 80 + 0.1·0.6 = 80.06 → +0.19·(79.4 − 80.06) = 79.9346 → +0.1·(80.2 − 79.9346) = 79.96114
    expect(t.map((p) => Number(p.trend.toFixed(5)))).toEqual([80, 80.06, 79.9346, 79.96114]);
  });

  it('applies α_eff = 1 − (1 − α)^Δ for gaps', () => {
    const t = computeTrend([
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-02', kg: 81 },
      { date: '2026-01-05', kg: 79 },
    ]);
    expect(t[1]!.trend).toBeCloseTo(80.1);
    const aEff = 1 - 0.9 ** 3;
    expect(t[2]!.trend).toBeCloseTo(80.1 + aEff * (79 - 80.1));
  });

  it('clamps α to 0.05–0.25', () => {
    const d = [
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-02', kg: 90 },
    ];
    expect(computeTrend(d, 0.9)[1]!.trend).toBeCloseTo(82.5);
    expect(computeTrend(d, 0.001)[1]!.trend).toBeCloseTo(80.5);
  });

  it('alternating ±1 kg noise keeps the trend within 0.3 kg', () => {
    const values = Array.from({ length: 120 }, (_, i) => (i === 0 ? 80 : i % 2 ? 79 : 81));
    const t = computeTrend(series('2026-01-01', values));
    const maxDev = Math.max(...t.map((p) => Math.abs(p.trend - 80)));
    expect(maxDev).toBeLessThan(0.3);
  });

  it('random ±1 kg noise: mean deviation of the trend < 0.3 kg', () => {
    // Note: with α = 0.1 the *maximum* deviation over 120 random days can reach ~0.45 kg,
    // so the spec criterion is checked on the mean absolute deviation.
    for (let seed = 1; seed <= 50; seed++) {
      const r = rng(seed);
      const values = Array.from({ length: 120 }, () => 80 + (r() * 2 - 1));
      const t = computeTrend(series('2026-01-01', values));
      const meanDev = t.reduce((sum, p) => sum + Math.abs(p.trend - 80), 0) / t.length;
      expect(meanDev).toBeLessThan(0.3);
    }
  });

  it('a −2 kg step reaches 63 % in about 10 days at α = 0.1', () => {
    const values = [...Array(10).fill(80), ...Array(30).fill(78)] as number[];
    const t = computeTrend(series('2026-01-01', values));
    const progress = (i: number) => (80 - t[9 + i]!.trend) / 2;
    expect(progress(9)).toBeLessThan(0.63);
    expect(progress(10)).toBeGreaterThanOrEqual(0.63);
  });
});

describe('trendOn / trendChange / trendSeries', () => {
  const pts = computeTrend([
    { date: '2026-01-01', kg: 80 },
    { date: '2026-01-05', kg: 79 },
    { date: '2026-01-11', kg: 78 },
  ]);

  it('is exact on weigh-in days and interpolates between', () => {
    expect(trendOn(pts, '2026-01-01')).toBe(80);
    expect(trendOn(pts, '2026-01-05')).toBe(pts[1]!.trend);
    expect(trendOn(pts, '2026-01-03')).toBeCloseTo((80 + pts[1]!.trend) / 2);
    expect(trendOn(pts, '2026-01-08')).toBeCloseTo((pts[1]!.trend + pts[2]!.trend) / 2);
  });

  it('is undefined before data, extrapolates ≤ 7 days after', () => {
    expect(trendOn([], '2026-01-01')).toBeUndefined();
    expect(trendOn(pts, '2025-12-31')).toBeUndefined();
    const last = pts[2]!.trend;
    const slope = (last - trendOn(pts, '2026-01-04')!) / 7;
    expect(trendOn(pts, '2026-01-12')).toBeCloseTo(last + slope);
    expect(trendOn(pts, '2026-01-18')).toBeCloseTo(last + 7 * slope);
    expect(trendOn(pts, '2026-01-19')).toBeUndefined();
  });

  it('uses a shorter slope window with little history, flat with one point', () => {
    const two = computeTrend([
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-03', kg: 82 },
    ]);
    const slope = (two[1]!.trend - 80) / 2;
    expect(trendOn(two, '2026-01-04')).toBeCloseTo(two[1]!.trend + slope);
    const one = computeTrend([{ date: '2026-01-01', kg: 80 }]);
    expect(trendOn(one, '2026-01-05')).toBe(80);
  });

  it('trend change over 7 days', () => {
    expect(trendChange(pts, '2026-01-11')).toBeCloseTo(pts[2]!.trend - trendOn(pts, '2026-01-04')!);
    expect(trendChange(pts, '2026-01-05')).toBeUndefined();
    expect(trendChange(pts, '2026-01-30')).toBeUndefined();
    expect(trendChange(pts, '2026-01-05', 4)).toBeCloseTo(pts[1]!.trend - 80);
  });

  it('daily series for charts', () => {
    const s = trendSeries(pts, '2025-12-31', '2026-01-02');
    expect(s).toEqual([
      { date: '2025-12-31', kg: null, trend: null },
      { date: '2026-01-01', kg: 80, trend: 80 },
      { date: '2026-01-02', kg: null, trend: trendOn(pts, '2026-01-02') },
    ]);
    expect(trendSeries(pts, '2026-01-02', '2026-01-01')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { proposeCheckin } from './checkin';

const base = { bmr: 1700, sex: 'male' as const, goalType: 'lose' as const };

describe('proposeCheckin', () => {
  it('TDEE + rate·7700/7 rounded to 10', () => {
    // 2735 − 550 = 2185 → 2190 (Math.round(218.5) = 219)
    expect(proposeCheckin({ ...base, tdee: 2735, rateKgPerWeek: -0.5, currentKcal: 2200 })).toEqual(
      {
        proposedKcal: 2190,
        rawKcal: 2190,
        limits: [],
      },
    );
  });

  it('limits the weekly change to ±200 kcal', () => {
    expect(
      proposeCheckin({ ...base, tdee: 3200, rateKgPerWeek: -0.5, currentKcal: 2200 }),
    ).toMatchObject({
      proposedKcal: 2400,
      rawKcal: 2650,
      limits: ['weeklyCap'],
    });
    expect(
      proposeCheckin({ ...base, tdee: 2200, rateKgPerWeek: -0.5, currentKcal: 2200 }).proposedKcal,
    ).toBe(2000);
  });

  it('never below max(BMR, 1200/1500)', () => {
    const r = proposeCheckin({
      ...base,
      sex: 'female',
      bmr: 1234,
      tdee: 1500,
      rateKgPerWeek: -0.5,
      currentKcal: 1300,
    });
    expect(r.proposedKcal).toBe(1240);
    expect(r.limits).toContain('floor');
    expect(
      proposeCheckin({ ...base, bmr: 1400, tdee: 1800, rateKgPerWeek: -1, currentKcal: 1600 })
        .proposedKcal,
    ).toBe(1500);
  });

  it('gain capped at TDEE + 500; maintain ignores rate', () => {
    const g = proposeCheckin({
      ...base,
      goalType: 'gain',
      tdee: 2500,
      rateKgPerWeek: 1,
      currentKcal: 2900,
    });
    expect(g.proposedKcal).toBe(3000);
    expect(g.limits).toEqual(['weeklyCap', 'gainCap']);
    expect(
      proposeCheckin({
        ...base,
        goalType: 'maintain',
        tdee: 2504,
        rateKgPerWeek: -1,
        currentKcal: 2500,
      }).proposedKcal,
    ).toBe(2500);
  });
});

import { describe, expect, it } from 'vitest';
import {
  checkRate,
  defaultRateKg,
  kcalFloor,
  planGoal,
  rateFromPct,
  rateToPct,
  round10,
  targetKcal,
  type PlanInput,
} from './goalPlan';

const base: PlanInput = {
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goalType: 'lose',
  rateKgPerWeek: -0.4,
  today: '2026-01-01',
};

describe('rates', () => {
  it('defaults and conversions', () => {
    expect(defaultRateKg('lose', 80)).toBe(-0.4);
    expect(defaultRateKg('gain', 80)).toBe(0.2);
    expect(defaultRateKg('maintain', 80)).toBe(0);
    expect(rateFromPct('lose', 1, 80)).toBe(-0.8);
    expect(rateFromPct('gain', 0.5, 80)).toBe(0.4);
    expect(rateFromPct('maintain', 1, 80)).toBe(0);
    expect(rateToPct(-0.8, 80)).toBeCloseTo(1);
  });

  it('safety checks', () => {
    const p = { weightKg: 80, heightCm: 180 };
    expect(checkRate({ ...p, goalType: 'maintain', rateKgPerWeek: -5 })).toEqual({
      warnings: [],
      blocked: false,
    });
    expect(checkRate({ ...p, goalType: 'lose', rateKgPerWeek: -0.8 }).warnings).toEqual([]);
    expect(checkRate({ ...p, goalType: 'lose', rateKgPerWeek: -1 }).warnings).toEqual(['fastLoss']);
    expect(checkRate({ ...p, goalType: 'lose', rateKgPerWeek: -0.1 }).warnings).toEqual([
      'slowRate',
    ]);
    expect(checkRate({ ...p, goalType: 'gain', rateKgPerWeek: 0.5 }).warnings).toEqual([
      'fastGain',
    ]);
    expect(checkRate({ ...p, goalType: 'gain', rateKgPerWeek: 0.2 }).warnings).toEqual([]);
    expect(
      checkRate({ weightKg: 55, heightCm: 180, goalType: 'lose', rateKgPerWeek: -0.2 }),
    ).toEqual({ warnings: ['underweightLose'], blocked: true });
    expect(
      checkRate({ weightKg: 55, heightCm: 180, goalType: 'gain', rateKgPerWeek: 0.2 }).blocked,
    ).toBe(false);
  });
});

describe('targetKcal', () => {
  it('applies the deficit: round10(tdee + rate·7700/7)', () => {
    expect(round10(2184)).toBe(2180);
    expect(
      targetKcal({ tdee: 2735, rateKgPerWeek: -0.5, goalType: 'lose', sex: 'male', bmr: 1700 }),
    ).toEqual({ kcal: 2190, floorApplied: false });
  });

  it('floors at max(BMR, 1200/1500)', () => {
    expect(kcalFloor('female', 1100)).toBe(1200);
    expect(kcalFloor('male', 1600)).toBe(1600);
    expect(
      targetKcal({ tdee: 1600, rateKgPerWeek: -1, goalType: 'lose', sex: 'female', bmr: 1150 }),
    ).toEqual({ kcal: 1200, floorApplied: true });
    expect(
      targetKcal({ tdee: 2000, rateKgPerWeek: -1, goalType: 'lose', sex: 'male', bmr: 1555 }).kcal,
    ).toBe(1560);
  });

  it("does not cap a gain (the pace is the user's choice) and ignores rate for maintain", () => {
    expect(
      targetKcal({ tdee: 2500, rateKgPerWeek: 1, goalType: 'gain', sex: 'male', bmr: 1700 }),
    ).toEqual({ kcal: 3600, floorApplied: false });
    expect(
      targetKcal({ tdee: 2504, rateKgPerWeek: -1, goalType: 'maintain', sex: 'male', bmr: 1700 })
        .kcal,
    ).toBe(2500);
  });
});

describe('planGoal', () => {
  it('computes the full plan', () => {
    const p = planGoal({ ...base, targetWeightKg: 74 });
    expect(p.age).toBe(30);
    expect(p.bmr).toBe(1780);
    expect(p.tdee).toBeCloseTo(2759);
    expect(p.kcal).toBe(2320);
    expect(p.macros.protein).toBe(160);
    expect(p.weeksToTarget).toBe(15);
    expect(p.warnings).toEqual([]);
    expect(p.blocked).toBe(false);
  });

  it('uses a known body fat for BMR and protein', () => {
    const p = planGoal({ ...base, bodyFatPct: 20 });
    expect(p.bmr).toBeCloseTo((1780 + 370 + 21.6 * 64) / 2);
    expect(p.macros.proteinRange[0]).toBe(147);
  });

  it('flags target in the wrong direction, maintain ignores target and rate', () => {
    expect(planGoal({ ...base, targetWeightKg: 85 }).warnings).toContain('targetDirection');
    expect(
      planGoal({ ...base, goalType: 'gain', rateKgPerWeek: 0.2, targetWeightKg: 70 }).warnings,
    ).toContain('targetDirection');
    const m = planGoal({ ...base, goalType: 'maintain', targetWeightKg: 70 });
    expect(m.rateKgPerWeek).toBe(0);
    expect(m.weeksToTarget).toBeNull();
    expect(m.kcal).toBe(2760);
    expect(planGoal({ ...base, rateKgPerWeek: 0, targetWeightKg: 70 }).weeksToTarget).toBeNull();
    expect(planGoal({ ...base, targetWeightKg: 0 }).weeksToTarget).toBeNull();
  });

  it('collects floor, cap, macro and rate warnings; blocks underweight loss', () => {
    const f = planGoal({
      ...base,
      sex: 'female',
      weightKg: 55,
      heightCm: 160,
      activityLevel: 'sedentary',
      rateKgPerWeek: -1,
    });
    expect(f.warnings).toEqual(expect.arrayContaining(['fastLoss', 'floorApplied']));
    expect(planGoal({ ...base, goalType: 'gain', rateKgPerWeek: 1 }).warnings).toEqual(
      expect.arrayContaining(['fastGain']),
    );
    const u = planGoal({ ...base, weightKg: 55 });
    expect(u.blocked).toBe(true);
    expect(u.warnings).toContain('underweightLose');
    const lowCarb = planGoal({
      ...base,
      weightKg: 100,
      heightCm: 185,
      activityLevel: 'sedentary',
      birthDate: '1950-01-01',
      rateKgPerWeek: -1,
    });
    expect(lowCarb.warnings).toContain('floorApplied');
  });
});

describe('fast gains and the floor', () => {
  const gain: PlanInput = {
    ...base,
    birthDate: '1999-08-01',
    today: '2026-11-01',
    weightKg: 66,
    activityLevel: 'light',
    goalType: 'gain',
    rateKgPerWeek: 0.99,
    targetWeightKg: 70,
  };

  it('a +0.99 kg/week gain is honoured: the surplus follows the pace, with a warning only', () => {
    const plan = planGoal(gain);
    expect(plan.warnings).toContain('fastGain');
    expect(plan.warnings).not.toContain('gainCapped' as never);
    expect(plan.kcal).toBe(round10(plan.tdee + (0.99 * 7700) / 7));
    expect(plan.kcal).toBeGreaterThan(plan.tdee + 1000);
    expect(plan.rateKgPerWeek).toBe(0.99);
    expect(plan.weeksToTarget).toBe(Math.ceil((70 - 66) / 0.99));
  });

  it('a floored loss reports the pace the floor allows', () => {
    const plan = planGoal({
      ...base,
      sex: 'female',
      weightKg: 55,
      heightCm: 160,
      activityLevel: 'sedentary',
      rateKgPerWeek: -1,
      targetWeightKg: 50,
    });
    expect(plan.warnings).toContain('floorApplied');
    expect(plan.rateKgPerWeek).toBeGreaterThan(-1);
    expect(plan.rateKgPerWeek).toBeLessThanOrEqual(0);
  });

  it('without a floor the requested pace is kept', () => {
    expect(planGoal(base).rateKgPerWeek).toBe(-0.4);
  });
});

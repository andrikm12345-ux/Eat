import { describe, expect, it } from 'vitest';
import { computeMacros, referenceWeight } from './macros';

const male80 = { weightKg: 80, heightCm: 180 };

describe('computeMacros', () => {
  it('default split while losing', () => {
    const r = computeMacros({ ...male80, kcal: 2200, goalType: 'lose' });
    expect(r).toMatchObject({ protein: 160, fat: 61, carbs: 253, fiber: 31, warnings: [] });
    expect(r.proteinRange).toEqual([144, 192]);
    expect(r.waterMl).toBe(2600);
    expect(r.waterRangeMl).toEqual([2400, 2800]);
    expect(4 * r.protein + 9 * r.fat + 4 * r.carbs).toBeCloseTo(2200, -1);
  });

  it('1.8 g/kg for maintain and gain', () => {
    expect(computeMacros({ ...male80, kcal: 2700, goalType: 'maintain' }).protein).toBe(144);
    expect(computeMacros({ ...male80, kcal: 3000, goalType: 'gain' }).protein).toBe(144);
  });

  it('uses adjusted weight (height² × 25) when BMI > 30', () => {
    expect(referenceWeight(80, 180)).toBe(80);
    const adj = 1.75 * 1.75 * 25;
    expect(referenceWeight(120, 175)).toBeCloseTo(adj);
    const r = computeMacros({ weightKg: 120, heightCm: 175, kcal: 2400, goalType: 'lose' });
    expect(r.protein).toBe(Math.round(2 * adj));
    expect(r.referenceWeightKg).toBeCloseTo(adj);
  });

  it('keeps protein within 2.3–3.1 g/kg LBM while losing', () => {
    const inRange = computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 64 });
    expect(inRange.protein).toBe(160);
    expect(inRange.proteinRange).toEqual([147, 198]);
    expect(computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 48 }).protein).toBe(
      149,
    );
    expect(computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 75 }).protein).toBe(
      173,
    );
    // LBM ignored for other goals and when invalid
    expect(computeMacros({ ...male80, kcal: 2700, goalType: 'gain', leanMassKg: 48 }).protein).toBe(
      144,
    );
    expect(computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 0 }).protein).toBe(
      160,
    );
  });

  it('clamps protein override and fat share', () => {
    expect(
      computeMacros({ ...male80, kcal: 2200, goalType: 'lose', proteinPerKg: 3 }).protein,
    ).toBe(192);
    expect(
      computeMacros({ ...male80, kcal: 2200, goalType: 'lose', proteinPerKg: 1 }).protein,
    ).toBe(144);
    expect(computeMacros({ ...male80, kcal: 3000, goalType: 'gain', fatShare: 0.5 }).fat).toBe(117);
    expect(computeMacros({ ...male80, kcal: 3000, goalType: 'gain', fatShare: 0.1 }).fat).toBe(67);
  });

  it('fat respects 0.6 g/kg minimum', () => {
    // 25 % of 1500 = 41.7 g < 0.6 × 80 = 48 g
    expect(computeMacros({ ...male80, kcal: 1500, goalType: 'lose' }).fat).toBe(48);
  });

  it('low carbs: lowers fat to minimum first', () => {
    const r = computeMacros({
      weightKg: 50,
      heightCm: 165,
      kcal: 850,
      goalType: 'maintain',
      fatShare: 0.35,
    });
    expect(r.warnings).toEqual(['lowCarbs']);
    expect(r.fat).toBe(30);
    expect(r.protein).toBe(90);
    expect(r.carbs).toBe(55);
  });

  it('low carbs: then lowers protein to the low end', () => {
    const r = computeMacros({ ...male80, kcal: 1200, goalType: 'lose' });
    expect(r.warnings).toEqual(['lowCarbs']);
    expect(r).toMatchObject({ fat: 48, protein: 144, carbs: 48 });
  });

  it('calorie target below macro minimums → carbs 0 with a warning', () => {
    const r = computeMacros({ ...male80, kcal: 500, goalType: 'lose' });
    expect(r.warnings).toEqual(['lowCarbs', 'kcalBelowMacroMinimum']);
    expect(r.carbs).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { computeMacros, referenceWeight } from './macros';

const male80 = { weightKg: 80, heightCm: 180 };

describe('computeMacros', () => {
  it('default split while losing', () => {
    const r = computeMacros({ ...male80, kcal: 2200, goalType: 'lose' });
    expect(r).toMatchObject({ protein: 160, fat: 61, carbs: 253, fiber: 31, warnings: [] });
    expect(r.proteinRange).toEqual([144, 165]); // 192 g would be more than 30 % of the calories
    expect(r.waterMl).toBe(2600);
    expect(r.waterRangeMl).toEqual([2400, 2800]);
    expect(4 * r.protein + 9 * r.fat + 4 * r.carbs).toBeCloseTo(2200, -1);
  });

  it('1.8 g/kg for maintain and gain', () => {
    expect(computeMacros({ ...male80, kcal: 2700, goalType: 'maintain' }).protein).toBe(144);
    expect(computeMacros({ ...male80, kcal: 3000, goalType: 'gain' }).protein).toBe(144);
  });

  it('reference weight: the actual one up to BMI 25, above it only 40 % of the excess (smooth)', () => {
    expect(referenceWeight(80, 180)).toBe(80);
    const edge = 1.75 * 1.75 * 25;
    expect(referenceWeight(edge, 175)).toBeCloseTo(edge);
    expect(referenceWeight(120, 175)).toBeCloseTo(edge + 0.4 * (120 - edge));
    // no jump: BMI 29.9 and 30.1 are almost the same reference weight
    const a = referenceWeight(29.9 * 1.69 * 1.69, 169);
    const b = referenceWeight(30.1 * 1.69 * 1.69, 169);
    expect(Math.abs(b - a)).toBeLessThan(0.5);
  });

  it('protein is at most 30 % of the calories', () => {
    const r = computeMacros({ weightKg: 120, heightCm: 175, kcal: 2400, goalType: 'lose' });
    expect(r.protein).toBe(180);
    expect((4 * r.protein) / 2400).toBeLessThanOrEqual(0.3);
  });

  it('the case that showed the mistake: woman, 169 cm, 85 kg, 1840 kcal, measurements giving 3 % fat', () => {
    const base = { weightKg: 85.1, heightCm: 169, kcal: 1840, goalType: 'lose' as const };
    // lean mass from an absurd 3 % body fat is ignored (it gave 187 g = 40 % of the calories)
    const r = computeMacros({ ...base, leanMassKg: 85.1 * 0.97 });
    expect(r.protein).toBe(138);
    expect(r.fat).toBe(51);
    expect(r.carbs).toBe(207);
    expect(computeMacros(base).protein).toBe(138);
  });

  it('keeps protein within 2.3–3.1 g/kg LBM while losing', () => {
    const inRange = computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 64 });
    expect(inRange.protein).toBe(160);
    expect(inRange.proteinRange).toEqual([147, 165]); // 3.1 g/kg of LBM = 198 g, but at most 30 % of calories
    expect(computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 48 }).protein).toBe(
      149,
    );
    // 75 kg of 80 would mean 6 % body fat: an input mistake, ignored (the weight rule is used)
    expect(computeMacros({ ...male80, kcal: 2200, goalType: 'lose', leanMassKg: 75 }).protein).toBe(
      160,
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
    ).toBe(165); // 3 g/kg would be 240 g; the range tops out at 2.4 g/kg and 30 % of calories
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

  it('low carbs: with protein capped at 30 % this only happens at very low calories; fat goes to its minimum and a warning is given', () => {
    const r = computeMacros({ weightKg: 60, heightCm: 155, kcal: 800, goalType: 'lose' });
    expect(r.warnings).toEqual(['lowCarbs']);
    expect(r).toMatchObject({ protein: 72, fat: 36, carbs: 47 });
    expect(4 * r.protein + 9 * r.fat + 4 * r.carbs).toBeCloseTo(800, -1);
  });

  it('calorie target below macro minimums → carbs 0 with a warning', () => {
    const r = computeMacros({ ...male80, kcal: 500, goalType: 'lose' });
    expect(r.warnings).toEqual(['lowCarbs', 'kcalBelowMacroMinimum']);
    expect(r.carbs).toBe(0);
  });
});

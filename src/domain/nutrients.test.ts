import { describe, expect, it } from 'vitest';
import {
  atwaterKcal,
  emptyNutrients,
  isKcalInconsistent,
  scaleNutrients,
  sumNutrients,
  withKcal,
} from './nutrients';

describe('nutrients', () => {
  it('Atwater', () => {
    expect(atwaterKcal({ protein: 10, fat: 5, carbs: 20 })).toBe(165);
  });

  it('flags >20 % mismatch between declared and Atwater kcal', () => {
    const n = { protein: 10, fat: 5, carbs: 20 }; // 165
    expect(isKcalInconsistent({ ...n, kcal: 165 })).toBe(false);
    expect(isKcalInconsistent({ ...n, kcal: 140 })).toBe(false); // 15 %
    expect(isKcalInconsistent({ ...n, kcal: 120 })).toBe(true); // 27 %
    expect(isKcalInconsistent({ ...n, kcal: 250 })).toBe(true);
    expect(isKcalInconsistent({ kcal: 0, protein: 0, fat: 0, carbs: 0 })).toBe(false);
    // tiny values are ignored (e.g. diet soda)
    expect(isKcalInconsistent({ kcal: 1, protein: 0, fat: 0, carbs: 0.1 })).toBe(false);
    expect(isKcalInconsistent({ kcal: 30, protein: 0, fat: 0, carbs: 0 })).toBe(true);
    expect(isKcalInconsistent({ kcal: 0, protein: 0, fat: 0, carbs: 10 })).toBe(true);
  });

  it('fills missing kcal with Atwater', () => {
    expect(withKcal({ protein: 10, fat: 5, carbs: 20 }).kcal).toBe(165);
    expect(withKcal({ kcal: NaN, protein: 10, fat: 5, carbs: 20 }).kcal).toBe(165);
    expect(withKcal({ kcal: -1, protein: 10, fat: 5, carbs: 20 }).kcal).toBe(165);
    expect(withKcal({ kcal: 150, protein: 10, fat: 5, carbs: 20, fiber: 3 })).toEqual({
      kcal: 150,
      protein: 10,
      fat: 5,
      carbs: 20,
      fiber: 3,
    });
  });

  it('scales per-100 g values, keeping unknown nutrients unknown', () => {
    const r = scaleNutrients({ kcal: 200, protein: 10, fat: 5, carbs: 30, fiber: 2 }, 150);
    expect(r).toEqual({ kcal: 300, protein: 15, fat: 7.5, carbs: 45, fiber: 3 });
    expect('sugar' in r).toBe(false);
    expect(
      scaleNutrients({ kcal: 100, protein: 1, fat: 1, carbs: 1, sugar: undefined }, 50),
    ).toEqual({ kcal: 50, protein: 0.5, fat: 0.5, carbs: 0.5 });
  });

  it('sums nutrients; optional keys only where reported', () => {
    const s = sumNutrients([
      { kcal: 100, protein: 1, fat: 2, carbs: 3, fiber: 1 },
      { kcal: 50, protein: 1, fat: 1, carbs: 1, iron: 2, sugar: undefined },
    ]);
    expect(s).toEqual({ kcal: 150, protein: 2, fat: 3, carbs: 4, fiber: 1, iron: 2 });
    expect(sumNutrients([])).toEqual(emptyNutrients());
  });
});

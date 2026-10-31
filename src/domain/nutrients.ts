import type { Nutrients } from './types';

export const MACRO_KEYS = ['kcal', 'protein', 'fat', 'carbs'] as const;

/** Atwater energy: 4·P + 9·F + 4·C. */
export function atwaterKcal(n: Pick<Nutrients, 'protein' | 'fat' | 'carbs'>): number {
  return 4 * n.protein + 9 * n.fat + 4 * n.carbs;
}

/** Relative mismatch threshold between declared kcal and Atwater kcal. */
export const ATWATER_TOLERANCE = 0.2;

/**
 * True when declared kcal and Atwater kcal differ by more than 20 %
 * ("данные продукта противоречивы"). Tiny values (< 20 kcal both) are ignored.
 */
export function isKcalInconsistent(n: Nutrients): boolean {
  const calc = atwaterKcal(n);
  const declared = n.kcal;
  if (!(declared > 0) && !(calc > 0)) return false;
  if (Math.max(declared, calc) < 20) return false;
  const base = Math.max(declared, calc);
  return Math.abs(declared - calc) / base > ATWATER_TOLERANCE;
}

/** Fills kcal from Atwater when it is missing (NaN/undefined/negative). */
export function withKcal(
  n: Partial<Nutrients> & Pick<Nutrients, 'protein' | 'fat' | 'carbs'>,
): Nutrients {
  const kcal = n.kcal;
  const valid = typeof kcal === 'number' && Number.isFinite(kcal) && kcal >= 0;
  return { ...n, kcal: valid ? kcal : atwaterKcal(n) };
}

export function emptyNutrients(): Nutrients {
  return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
}

/** Absolute nutrients of `grams` of a food given per-100 g values. Unknown keys stay unknown. */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  const out: Nutrients = emptyNutrients();
  for (const [key, v] of Object.entries(per100g)) {
    if (typeof v === 'number') out[key] = v * k;
  }
  return out;
}

/**
 * Sums nutrients. Core macros are always summed (missing = 0). Optional nutrients
 * are summed only over items that report them; a key absent from every item stays absent.
 */
export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  const out: Nutrients = emptyNutrients();
  for (const n of list) {
    for (const [key, v] of Object.entries(n)) {
      if (typeof v !== 'number') continue;
      out[key] = (out[key] ?? 0) + v;
    }
  }
  return out;
}

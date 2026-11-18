import type { FoodDraft } from '../domain/off';
import type { Nutrients } from '../domain/types';
import { fetchOff } from './off';

/** EAN-8 / UPC-A / EAN-13 with a valid check digit (a misread digit would find a wrong product). */
export function isValidEan(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const hasNutrition = (n: Nutrients) => n.kcal > 0 || n.protein + n.fat + n.carbs > 0;

const close = (a: number, b: number, abs: number) =>
  Math.abs(a - b) <= Math.max(abs, 0.15 * Math.max(a, b));

/** The label read and the database agree within the rounding people print on packages. */
export const sameNutrition = (a: Nutrients, b: Nutrients): boolean =>
  close(a.kcal, b.kcal, 10) &&
  close(a.protein, b.protein, 1) &&
  close(a.fat, b.fat, 1) &&
  close(a.carbs, b.carbs, 1.5);

const fmt = (n: Nutrients) =>
  `${Math.round(n.kcal)} ккал, Б ${n.protein}, Ж ${n.fat}, У ${n.carbs}`;

export type OffCheck = { note: string; alt?: Nutrients } | null;

/**
 * After a label photo: if the barcode is valid and Open Food Facts knows the product with its
 * nutrition, compare. Same values → a short confirmation; different → both are shown and the
 * database values can be taken instead. No data / no network → nothing (never blocks the photo).
 */
export async function checkLabelWithOff(
  draft: FoodDraft,
  opts: Parameters<typeof fetchOff>[1] = {},
): Promise<OffCheck> {
  const code = draft.barcode;
  if (!code || !isValidEan(code)) return null;
  const res = await fetchOff(code, { timeoutMs: 4000, ...opts });
  if (res.kind !== 'found' || !hasNutrition(res.draft.per100g)) return null;
  if (sameNutrition(draft.per100g, res.draft.per100g))
    return { note: 'Значения совпали с базой Open Food Facts по этому штрихкоду.' };
  return {
    note: `Open Food Facts по этому штрихкоду: ${fmt(res.draft.per100g)}. С фото прочитано: ${fmt(draft.per100g)}. Сверьте с упаковкой.`,
    alt: res.draft.per100g,
  };
}

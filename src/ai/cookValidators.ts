import { withPieces, type Difficulty, type DishIdea, type DishIngredient } from '../domain/cook';
import type { Nutrients } from '../domain/types';
import { cleanName, isObj, num, per100, pieceInfo, type Valid } from './validators';

const DIFFICULTY: Difficulty[] = ['easy', 'medium', 'hard'];

function ingredient(v: unknown, path: string, errors: string[]): DishIngredient | null {
  if (!isObj(v)) {
    errors.push(`${path}: нужен объект`);
    return null;
  }
  const name = typeof v.name === 'string' ? cleanName(v.name) : '';
  if (!name) errors.push(`${path}.name: нужна строка`);
  if (!num(v.grams) || (v.grams as number) <= 0 || (v.grams as number) > 3000)
    errors.push(`${path}.grams: число 1–3000`);
  const n = per100(v.per100g, `${path}.per100g`, errors, ['kcal', 'protein', 'fat', 'carbs'], []);
  if (!name || !n || !num(v.grams) || !((v.grams as number) > 0)) return null;
  return withPieces({
    name,
    grams: v.grams as number,
    per100g: n as Nutrients,
    ...pieceInfo(v),
    ...(v.optional === true ? { optional: true } : {}),
  });
}

/**
 * Dishes proposed for the pantry. A broken dish is left out (the others are still useful); the
 * answer fails only when no dish is usable, so the AI is asked once more.
 */
export function validateCookIdeas(data: unknown): Valid<DishIdea[]> {
  if (!isObj(data) || !Array.isArray(data.dishes))
    return { ok: false, errors: ['dishes: нужен массив блюд'] };
  const errors: string[] = [];
  const out: DishIdea[] = [];
  data.dishes.slice(0, 14).forEach((d: unknown, i: number) => {
    const p = `dishes[${i}]`;
    const local: string[] = [];
    if (!isObj(d)) {
      errors.push(`${p}: нужен объект`);
      return;
    }
    // The AI itself says it is not a real, known dish: it is not offered.
    if (d.classic === false) return;
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) local.push(`${p}.name: нужна строка`);
    const minutes = num(d.minutes) ? Math.round(d.minutes as number) : NaN;
    if (!(minutes >= 1 && minutes <= 600)) local.push(`${p}.minutes: число 1–600`);
    const list = Array.isArray(d.ingredients) ? d.ingredients : [];
    if (list.length === 0 || list.length > 30) local.push(`${p}.ingredients: 1–30 ингредиентов`);
    const ingredients = list
      .map((x: unknown, j: number) => ingredient(x, `${p}.ingredients[${j}]`, local))
      .filter((x): x is DishIngredient => x !== null);
    if (local.length) {
      errors.push(...local);
      return;
    }
    out.push({
      name: cleanName(name),
      minutes,
      difficulty: DIFFICULTY.includes(d.difficulty as Difficulty)
        ? (d.difficulty as Difficulty)
        : 'medium',
      ...(num(d.portionGrams) &&
      (d.portionGrams as number) >= 20 &&
      (d.portionGrams as number) <= 3000
        ? { portionGrams: Math.round(d.portionGrams as number) }
        : {}),
      ingredients,
    });
  });
  return out.length
    ? { ok: true, value: out }
    : { ok: false, errors: errors.length ? errors : ['dishes: пусто'] };
}

export type CookSteps = { steps: { text: string; minutes: number }[]; tip: string };

export function validateCookSteps(data: unknown): Valid<CookSteps> {
  if (!isObj(data) || !Array.isArray(data.steps))
    return { ok: false, errors: ['steps: нужен массив шагов'] };
  const errors: string[] = [];
  const steps = data.steps.flatMap((s: unknown, i: number) => {
    if (!isObj(s) || typeof s.text !== 'string' || s.text.trim().length < 3) {
      errors.push(`steps[${i}].text: нужна строка`);
      return [];
    }
    const minutes = num(s.minutes) ? Math.min(600, Math.round(s.minutes as number)) : 0;
    return [{ text: s.text.trim().slice(0, 500), minutes }];
  });
  if (steps.length < 1 || steps.length > 15) errors.push('steps: 1–15 шагов');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { steps, tip: typeof data.tip === 'string' ? data.tip.trim().slice(0, 300) : '' },
  };
}

export type FridgeItem = { name: string; grams: number | null; count: number | null };

export function validateFridge(data: unknown): Valid<FridgeItem[]> {
  if (!isObj(data) || !Array.isArray(data.items))
    return { ok: false, errors: ['items: нужен массив продуктов'] };
  const items = data.items.flatMap((x: unknown) => {
    if (!isObj(x) || typeof x.name !== 'string' || !x.name.trim()) return [];
    const grams = num(x.grams) && (x.grams as number) > 0 ? Math.round(x.grams as number) : null;
    const count =
      num(x.count) && (x.count as number) > 0 && (x.count as number) <= 100
        ? Math.round(x.count as number)
        : null;
    return [{ name: cleanName(x.name).slice(0, 60), grams, count }];
  });
  return { ok: true, value: items.slice(0, 40) };
}

/** Numbers (from 1) of the dish names the editor calls made up. */
export function validateCookVerify(data: unknown): Valid<number[]> {
  if (!isObj(data) || !Array.isArray(data.fake))
    return { ok: false, errors: ['fake: нужен массив номеров'] };
  return {
    ok: true,
    value: data.fake.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 50),
  };
}

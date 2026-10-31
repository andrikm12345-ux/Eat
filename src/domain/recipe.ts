import { emptyNutrients, scaleNutrients, sumNutrients } from './nutrients';
import type { Nutrients } from './types';

export type Ingredient = { per100g: Nutrients; grams: number };

/**
 * Per-100 g of the cooked dish: total nutrients of the ingredients divided by the cooked
 * weight (accounts for water loss/gain); raw total weight when cooked weight is unknown.
 */
export function recipePer100g(
  ingredients: readonly Ingredient[],
  cookedWeightG?: number | null,
): Nutrients {
  const total = sumNutrients(ingredients.map((i) => scaleNutrients(i.per100g, i.grams)));
  const raw = ingredients.reduce((s, i) => s + i.grams, 0);
  const weight = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : raw;
  if (!(weight > 0)) return emptyNutrients();
  return scaleNutrients(total, (100 / weight) * 100);
}

/** Grams of one serving of the cooked dish. */
export function servingGrams(
  ingredients: readonly Ingredient[],
  cookedWeightG: number | null | undefined,
  servings: number,
): number {
  const raw = ingredients.reduce((s, i) => s + i.grams, 0);
  const weight = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : raw;
  return servings > 0 ? weight / servings : weight;
}

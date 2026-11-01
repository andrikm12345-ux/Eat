import { emptyNutrients, scaleNutrients } from '../domain/nutrients';
import { recipePer100g } from '../domain/recipe';
import type { Entry, Food, LocalDate, LocalTime, Recipe, Template } from '../domain/types';
import type { Repos } from '../db/repos';
import { reviewKey, type ReviewDraft } from '../state/review';

/** per-100 g of a recipe from current food data (missing foods count as zero). */
export async function computeRecipePer100g(
  r: Repos,
  ingredients: Recipe['ingredients'],
  cookedWeightG?: number,
) {
  const foods = await r.db.foods.bulkGet(ingredients.map((i) => i.foodId));
  return recipePer100g(
    ingredients.map((i, idx) => ({
      grams: i.grams,
      per100g: (foods[idx] as Food | undefined)?.per100g ?? {
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
      },
    })),
    cookedWeightG,
  );
}

/** Logs `grams` of a cooked recipe as one entry item. */
export async function logRecipe(
  r: Repos,
  recipe: Recipe,
  grams: number,
  at: { date: LocalDate; time: LocalTime },
): Promise<Entry> {
  return r.entries.add({
    ...at,
    items: [
      {
        recipeId: recipe.id,
        name: recipe.name,
        grams,
        nutrients: scaleNutrients(recipe.per100g, grams),
      },
    ],
    source: 'manual',
  });
}

/** Review draft from a template (grams editable; per-100 g derived from the snapshot). */
export function templateToDraft(t: Template, date: LocalDate, time: LocalTime): ReviewDraft {
  return {
    items: (t.items ?? []).map((i) => ({
      key: reviewKey(),
      name: i.name,
      grams: i.grams,
      per100g:
        i.grams > 0
          ? scaleNutrients(i.snapshot ?? emptyNutrients(), (100 / i.grams) * 100)
          : (i.snapshot ?? emptyNutrients()),
      source: 'catalog',
      ...(i.foodId ? { foodId: i.foodId } : {}),
      ...(i.recipeId ? { recipeId: i.recipeId } : {}),
    })),
    entrySource: 'template',
    date,
    time,
    mealLabel: t.name,
  };
}

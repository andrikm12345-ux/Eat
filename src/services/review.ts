import { scaleNutrients } from '../domain/nutrients';
import type { EntryItem } from '../domain/types';
import { repos } from '../db/repos';
import type { ReviewDraft, ReviewItem } from '../state/review';

const nutrientsOf = (i: ReviewItem) => scaleNutrients(i.per100g, i.grams);

/** Persists reviewed items as one diary entry. */
export async function saveReview(d: ReviewDraft) {
  const items: EntryItem[] = d.items.map((i) => ({
    ...(i.foodId ? { foodId: i.foodId } : {}),
    ...(i.recipeId ? { recipeId: i.recipeId } : {}),
    name: i.name,
    grams: i.grams,
    nutrients: nutrientsOf(i),
    ...(i.confidence ? { confidence: i.confidence } : {}),
  }));
  return repos.db.transaction('rw', repos.db.entries, repos.db.foods, async () => {
    const e = await repos.entries.add({
      date: d.date,
      time: d.time,
      items,
      source: d.entrySource,
      ...(d.aiRunId ? { aiRunId: d.aiRunId } : {}),
      ...(d.mealLabel ? { mealLabel: d.mealLabel } : {}),
    });
    for (const i of d.items) if (i.foodId) await repos.foods.markUsed(i.foodId, i.grams);
    return e;
  });
}

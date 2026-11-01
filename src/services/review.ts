import { scaleNutrients } from '../domain/nutrients';
import type { EntryItem } from '../domain/types';
import { foodSearchKey, repos } from '../db/repos';
import type { ReviewDraft, ReviewItem } from '../state/review';

const nutrientsOf = (i: ReviewItem) => scaleNutrients(i.per100g, i.grams);

/**
 * Persists reviewed items as one diary entry. Items whose key is in `remember` are the
 * user's corrections of an AI estimate: they are kept as own verified foods, so the next
 * estimate of the same dish starts from the corrected values.
 */
export async function saveReview(d: ReviewDraft, opts: { remember?: ReadonlySet<string> } = {}) {
  return repos.db.transaction('rw', repos.db.entries, repos.db.foods, async () => {
    const foodIds = new Map<string, string>();
    for (const i of d.items) {
      if (i.foodId || !opts.remember?.has(i.key)) continue;
      const key = foodSearchKey(i.name);
      const same = (await repos.foods.list()).find(
        (f) => f.source === 'user' && f.searchKey === key,
      );
      if (same) {
        await repos.foods.edit(same.id, { per100g: i.per100g, verified: true });
        foodIds.set(i.key, same.id);
      } else {
        const f = await repos.foods.add({
          name: i.name,
          per100g: i.per100g,
          servings: [],
          source: 'user',
          verified: true,
        });
        foodIds.set(i.key, f.id);
      }
    }
    const items: EntryItem[] = d.items.map((i) => {
      const foodId = i.foodId ?? foodIds.get(i.key);
      return {
        ...(foodId ? { foodId } : {}),
        ...(i.recipeId ? { recipeId: i.recipeId } : {}),
        name: i.name,
        grams: i.grams,
        nutrients: nutrientsOf(i),
        ...(i.confidence ? { confidence: i.confidence } : {}),
      };
    });
    const e = await repos.entries.add({
      date: d.date,
      time: d.time,
      items,
      source: d.entrySource,
      ...(d.aiRunId ? { aiRunId: d.aiRunId } : {}),
      ...(d.mealLabel ? { mealLabel: d.mealLabel } : {}),
    });
    for (const i of d.items) {
      const id = i.foodId ?? foodIds.get(i.key);
      if (id) await repos.foods.markUsed(id, i.grams);
    }
    return e;
  });
}

/** Keys of AI items the user has changed by hand (they become `manual`). */
export function correctedKeys(baseline: ReviewItem[], now: ReviewItem[]): string[] {
  const was = new Map(baseline.map((i) => [i.key, i]));
  return now
    .filter((i) => i.source === 'manual' && !i.foodId && was.get(i.key)?.source === 'ai')
    .map((i) => i.key);
}

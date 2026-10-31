import { bestMatch, buildIndex } from '../domain/search';
import { isKcalInconsistent, withKcal } from '../domain/nutrients';
import type { Food, LocalDate, LocalTime } from '../domain/types';
import type { Repos } from '../db/repos';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import type { LabelResult, MealResult } from '../ai/validators';
import type { FoodDraft } from '../domain/off';

export const MATCH_THRESHOLD = 0.8;

/**
 * Review draft from an AI meal estimate. Items whose `searchHint` matches a verified
 * catalog food with similarity ≥ 0.8 use the catalog data by default (grams kept);
 * the AI values stay available as an alternative.
 */
export async function mealToDraft(
  r: Repos,
  res: MealResult,
  at: { date: LocalDate; time: LocalTime },
  meta: { entrySource: 'ai_photo' | 'ai_text'; aiRunId: string },
): Promise<ReviewDraft> {
  const index = buildIndex(await r.foods.list());
  const items: ReviewItem[] = res.items.map((it) => {
    const ai = {
      name: it.name,
      per100g: withKcal(it.per100g),
      source: 'ai' as const,
      confidence: it.confidence,
      assumed: it.assumed,
    };
    const m = bestMatch(index, it.searchHint) ?? bestMatch(index, it.name);
    if (m && m.similarity >= MATCH_THRESHOLD) {
      const f: Food = m.item;
      return {
        key: reviewKey(),
        grams: it.grams,
        name: f.name,
        per100g: f.per100g,
        foodId: f.id,
        source: 'catalog',
        confidence: it.confidence,
        assumed: it.assumed,
        alt: ai,
      };
    }
    const alt = m
      ? {
          name: m.item.name,
          per100g: m.item.per100g,
          source: 'catalog' as const,
          foodId: m.item.id,
        }
      : undefined;
    return { key: reviewKey(), grams: it.grams, ...ai, ...(alt ? { alt } : {}) };
  });
  return {
    items,
    entrySource: meta.entrySource,
    aiRunId: meta.aiRunId,
    date: at.date,
    time: at.time,
    ...(res.notes ? { notes: res.notes } : {}),
    ...(res.mealGuess
      ? { mealLabel: res.mealGuess.charAt(0).toUpperCase() + res.mealGuess.slice(1) }
      : {}),
  };
}

/** Product draft from a label read (per 100 g), with warnings incl. Atwater check. */
export function labelToDraft(
  res: LabelResult,
  barcode?: string,
): { draft: FoodDraft; warnings: string[] } {
  const per100g = withKcal(res.per100g);
  const warnings = [...res.warnings];
  if (isKcalInconsistent(per100g))
    warnings.push('Калории не сходятся с БЖУ больше чем на 20 % — проверьте значения.');
  if (res.confidence === 'low')
    warnings.push('Низкая уверенность распознавания — сверьте с упаковкой.');
  return {
    draft: {
      name: res.name ?? '',
      ...(res.brand ? { brand: res.brand } : {}),
      ...((barcode ?? res.barcode) ? { barcode: (barcode ?? res.barcode) as string } : {}),
      per100g,
      servings: res.serving ? [res.serving] : [],
    },
    warnings,
  };
}

/**
 * Recipe ingredients from an AI meal parse: verified catalog matches (≥ 0.8) are used
 * directly; other items become unverified user foods with the AI per-100 g values.
 * The recipe editor itself is the review step (nothing is saved to the diary).
 */
export async function mealToIngredients(
  r: Repos,
  res: MealResult,
): Promise<{ foodId: string; grams: number }[]> {
  const index = buildIndex(await r.foods.list());
  const out: { foodId: string; grams: number }[] = [];
  for (const it of res.items) {
    const m = bestMatch(index, it.searchHint) ?? bestMatch(index, it.name);
    if (m && m.similarity >= MATCH_THRESHOLD) {
      out.push({ foodId: m.item.id, grams: it.grams });
    } else {
      const f = await r.foods.add({
        name: it.name,
        per100g: withKcal(it.per100g),
        servings: [],
        source: 'user',
        verified: false,
      });
      out.push({ foodId: f.id, grams: it.grams });
    }
  }
  return out;
}

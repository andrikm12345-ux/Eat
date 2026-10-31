import { resolveGrams, parseMealText } from '../domain/mealText';
import { buildIndex, search } from '../domain/search';
import type { Food, LocalDate, LocalTime } from '../domain/types';
import type { Repos } from '../db/repos';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import { cacheOffDraft, searchOff } from './off';

/**
 * "Анализировать" without AI: split the text into foods and quantities, match each to the
 * local catalog (fuzzy) and, when missing, to Open Food Facts. Unmatched items stay as
 * empty lines for the user to replace on the review screen.
 */
export async function analyzeMealLocally(
  r: Repos,
  text: string,
  at: { date: LocalDate; time: LocalTime },
  opts: { fetchImpl?: typeof fetch; online?: boolean; note?: string } = {},
): Promise<ReviewDraft> {
  const parsed = parseMealText(text);
  const index = buildIndex(await r.foods.list());
  const items: ReviewItem[] = await Promise.all(
    parsed.map(async (p): Promise<ReviewItem> => {
      const local: Food | undefined = search(index, p.query, { limit: 1 })[0];
      if (local) {
        return {
          key: reviewKey(),
          name: local.name,
          grams: resolveGrams(p, local),
          per100g: local.per100g,
          foodId: local.id,
          source: 'catalog',
          confidence: local.verified ? 'medium' : 'low',
        };
      }
      const res = await searchOff(p.query, {
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.online !== undefined ? { online: opts.online } : {}),
      });
      const draft = res.kind === 'ok' ? res.drafts[0] : undefined;
      if (draft) {
        const food = await cacheOffDraft(r, draft);
        return {
          key: reviewKey(),
          name: food.name,
          grams: resolveGrams(p, food),
          per100g: food.per100g,
          foodId: food.id,
          source: 'off',
          confidence: 'low',
        };
      }
      return {
        key: reviewKey(),
        name: p.query,
        grams: resolveGrams(p, { servings: [] }),
        per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        source: 'manual',
        confidence: 'low',
      };
    }),
  );
  return {
    items,
    entrySource: 'manual',
    date: at.date,
    time: at.time,
    ...(opts.note ? { notes: opts.note } : {}),
  };
}

import type { Repos } from '../db/repos';
import { bestMatch, buildIndex } from '../domain/search';
import type { Nutrients } from '../domain/types';
import { reviewKey, type ReviewItem } from '../state/review';
import { MATCH_THRESHOLD } from './aiFood';

/** Tea, coffee and the like: drinks that are usually taken with sugar or milk. */
export const isDrink = (name: string): boolean =>
  /(^|[\s(])(чай|кофе|какао|капучино|латте|американо|эспрессо)/iu.test(name);

export type Addition = 'sugar1' | 'sugar2' | 'milk';

const SPEC: Record<Addition, { query: string; name: string; grams: number; per100g: Nutrients }> = {
  sugar1: {
    query: 'Сахар',
    name: 'Сахар',
    grams: 5,
    per100g: { kcal: 399, protein: 0, fat: 0, carbs: 99.8 },
  },
  sugar2: {
    query: 'Сахар',
    name: 'Сахар',
    grams: 10,
    per100g: { kcal: 399, protein: 0, fat: 0, carbs: 99.8 },
  },
  milk: {
    query: 'Молоко 2%',
    name: 'Молоко',
    grams: 30,
    per100g: { kcal: 51, protein: 3, fat: 2, carbs: 4.7 },
  },
};

/** The review line for what is added to a drink: from the catalog when it is there. */
export async function additionItem(r: Repos, kind: Addition): Promise<ReviewItem> {
  const spec = SPEC[kind];
  const m = bestMatch(buildIndex(await r.foods.list()), spec.query);
  if (m && m.similarity >= MATCH_THRESHOLD) {
    return {
      key: reviewKey(),
      name: m.item.name,
      grams: spec.grams,
      per100g: m.item.per100g,
      foodId: m.item.id,
      source: 'catalog',
      confidence: 'high',
    };
  }
  return {
    key: reviewKey(),
    name: spec.name,
    grams: spec.grams,
    per100g: spec.per100g,
    source: 'manual',
    confidence: 'high',
  };
}

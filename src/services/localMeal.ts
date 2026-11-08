import { resolveGrams, parseMealText, type ParsedItem } from '../domain/mealText';
import { buildIndex, search, similarity, type IndexedItem } from '../domain/search';
import type { Food, LocalDate, LocalTime } from '../domain/types';
import type { Repos } from '../db/repos';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import { itemsFromMemory, loadMemory, partOf, recall, type MemoryPart } from './mealMemory';
import { groupParts } from './mealParts';
import { cacheOffDraft, searchOff } from './off';

/** Below this a catalog hit is a different food ("миска салата" → Caesar dressing). */
const MIN_SIMILARITY = 0.35;
const RAW = /крупа|сух|сыр(?:ой|ая|ые|ое)/iu;
const COOKED = /варён|варен|на воде/iu;

/**
 * The catalog food for a fragment, or nothing when the best hit is too far. A grain without
 * "сухая"/"крупа" in the words is the cooked one ("гречка 200 г" is a plate, not a dry pack).
 */
function pickLocal(
  index: IndexedItem<Food>[],
  byId: Map<string, IndexedItem<Food>>,
  query: string,
): Food | undefined {
  const hits = search(index, query, { limit: 8 }).filter((f) => {
    const ix = byId.get(f.id);
    return !!ix && similarity(ix, query) >= MIN_SIMILARITY;
  });
  const top = hits[0];
  if (top && RAW.test(top.name) && !RAW.test(query))
    return hits.find((f) => COOKED.test(f.name)) ?? top;
  return top;
}

/**
 * "Анализировать" without AI: split the text into foods and quantities; a phrase saved before
 * comes back as it was saved, the others are matched to the local catalog (fuzzy) and, when
 * missing, to Open Food Facts. Unmatched items stay as
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
  const byId = new Map(index.map((ix) => [ix.item.id, ix]));
  const mem = await loadMemory(r);
  const memory: MemoryPart[] = [];
  const one = async (p: ParsedItem): Promise<ReviewItem> => {
    const local = pickLocal(index, byId, p.query);
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
  };
  // A phrase saved before comes back as it was saved; the rest goes fragment by fragment.
  const perGroup = await Promise.all(
    groupParts(parsed).map(async (g): Promise<ReviewItem[]> => {
      const hit = recall(mem, g.part);
      if (!hit) return Promise.all(g.members.map(one));
      const items = itemsFromMemory(hit, g.part);
      memory.push(partOf(g.part, items));
      return items;
    }),
  );
  const items = perGroup.flat();
  return {
    items,
    entrySource: 'manual',
    analysis: 'local',
    date: at.date,
    time: at.time,
    ...(opts.note ? { notes: opts.note } : {}),
    ...(memory.length ? { memory } : {}),
  };
}

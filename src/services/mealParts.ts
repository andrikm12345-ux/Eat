import { PROMPT_MEAL } from '../ai/prompts';
import { runAi } from '../ai/run';
import { validateMeal } from '../ai/validators';
import type { Repos } from '../db/repos';
import { parseMealText, resolveGrams, type ParsedItem } from '../domain/mealText';
import { bestMatch, buildIndex } from '../domain/search';
import type { LocalDate, LocalTime } from '../domain/types';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import { MATCH_THRESHOLD, mealToDraft } from './aiFood';
import { searchWeb, type WebContext } from './webSearch';

/** At most this many parts are looked up on the web per description (every lookup is a request). */
export const MAX_WEB_PARTS = 3;

/** A brand or a title in the fragment (Latin letters, quotes, a capitalised word inside). */
const looksBranded = (raw: string) => /[A-Za-z«"“]/.test(raw) || /\s[А-ЯЁ][а-яё]{2,}/.test(raw);

/** The part's quantity is stated (grams, volume or a count), so the catalog can answer alone. */
const hasQuantity = (p: ParsedItem) => p.grams !== null || p.count !== null;

/** Which parts to search for: branded ones first, then the rest in order, at most MAX_WEB_PARTS. */
export function pickWebParts(parts: ParsedItem[]): ParsedItem[] {
  const branded = parts.filter((p) => looksBranded(p.raw));
  const plain = parts.filter((p) => !looksBranded(p.raw));
  return [...branded, ...plain].slice(0, MAX_WEB_PARTS);
}

/** The AI message: the fragments the catalog could not answer, each with its own web reference. */
export function partsMessage(parts: ParsedItem[], refs: Map<string, WebContext>): string {
  const lines = parts.map((p) => `- ${p.raw.trim()}`).join('\n');
  const refText = parts
    .filter((p) => refs.has(p.raw))
    .map((p) => `Справка для «${p.query}»:\n${refs.get(p.raw)?.text ?? ''}`)
    .join('\n\n');
  if (!refText) return lines;
  return `${lines}\n\nСправка из интернета (результаты поиска, могут быть неточными или относиться к другому продукту). Для каждого продукта: если справка относится именно к нему — возьми из неё калорийность и БЖУ на 100 г и поставь "source": "web"; если нет — игнорируй её и поставь "source": "estimate".\n${refText}`;
}

/**
 * "Описать" by parts. Each fragment of the description goes the cheapest way that is exact:
 * 1. a fragment with a stated quantity that matches the catalog is taken from the catalog;
 * 2. the others are looked up on the web (a few, in parallel) and given to the AI, which
 *    estimates only them and says per item whether the numbers came from the web or are its
 *    own estimate.
 * With nothing parsed, the whole text goes to the AI as before. Throws when the AI fails
 * (the caller falls back to the local analysis).
 */
export async function analyzeMealByParts(
  r: Repos,
  text: string,
  at: { date: LocalDate; time: LocalTime },
): Promise<ReviewDraft> {
  const parts = parseMealText(text);
  const index = buildIndex(await r.foods.list());
  const fromCatalog: ReviewItem[] = [];
  const rest: ParsedItem[] = [];
  for (const p of parts) {
    const m = hasQuantity(p) ? bestMatch(index, p.query) : null;
    if (m && m.similarity >= MATCH_THRESHOLD) {
      fromCatalog.push({
        key: reviewKey(),
        name: m.item.name,
        grams: resolveGrams(p, m.item),
        per100g: m.item.per100g,
        foodId: m.item.id,
        source: 'catalog',
        confidence: 'high',
      });
    } else rest.push(p);
  }

  // Everything is in the catalog: no AI and no web needed.
  if (parts.length > 0 && rest.length === 0) {
    return {
      items: fromCatalog,
      entrySource: 'manual',
      analysis: 'local',
      date: at.date,
      time: at.time,
    };
  }

  // Nothing could be split: the whole description goes through as one fragment.
  const todo: ParsedItem[] =
    rest.length > 0 ? rest : [{ raw: text.trim(), query: text.trim(), grams: null, count: null }];
  const toSearch = pickWebParts(todo);
  const found = await Promise.all(toSearch.map((p) => searchWeb(r, p.query)));
  const refs = new Map<string, WebContext>();
  toSearch.forEach((p, i) => {
    const web = found[i];
    if (web) refs.set(p.raw, web);
  });
  const sources = [...refs.values()].flatMap((w) => w.sources);

  const { value, runId } = await runAi(r, {
    kind: 'text',
    vision: false,
    system: PROMPT_MEAL,
    content: [{ type: 'text', text: partsMessage(todo, refs) }],
    validate: validateMeal,
  });
  // Without any reference nothing can have come from the web, whatever the model claims.
  const checked = {
    ...value,
    items: value.items.map((it) => ({
      ...it,
      source: refs.size > 0 ? (it.source ?? 'estimate') : ('estimate' as const),
    })),
  };
  const aiDraft = await mealToDraft(r, checked, at, { entrySource: 'ai_text', aiRunId: runId });
  return {
    ...aiDraft,
    items: [...fromCatalog, ...aiDraft.items],
    ...(sources.length > 0 ? { sources } : {}),
  };
}

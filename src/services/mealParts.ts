import { PROMPT_MEAL } from '../ai/prompts';
import { runAi } from '../ai/run';
import { validateMeal } from '../ai/validators';
import type { Repos } from '../db/repos';
import { parseMealText, resolveGrams, type ParsedItem } from '../domain/mealText';
import { bestMatch, buildIndex } from '../domain/search';
import type { LocalDate, LocalTime } from '../domain/types';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import { MATCH_THRESHOLD, mealToDraft } from './aiFood';
import {
  itemsFromMemory,
  loadMemory,
  mapItemsToParts,
  partOf,
  recall,
  type MemoryPart,
} from './mealMemory';
import { searchWeb } from './webSearch';

/** Without a stated quantity a catalog match must be almost exact. */
const EXACT_THRESHOLD = 0.95;

/** At most this many parts are looked up on the web per description (every lookup is a request). */
export const MAX_WEB_PARTS = 3;

/** Shops, chains and cafes people name in lower case ("из пятёрочки", "пятёрочка кафе"). */
const CHAINS =
  /(?<!\p{L})(?:пят[её]рочк\p{L}*|магнит\p{L}*|вкусвилл\p{L}*|перекр[её]ст\p{L}*|ашан\p{L}*|дикси|самокат\p{L}*|окей|лента|ленту|ленте|азбук\p{L}*\s+вкуса|бургер\s*кинг|макдоналдс|макдональдс|ростикс|kfc|кфс|додо|subway|сабвей|кафе|столов\p{L}*|из магазина)(?!\p{L})/iu;

/** A brand, a title, a shop or a cafe in the fragment: what only a reference can tell. */
const looksBranded = (raw: string) =>
  /[A-Za-z«"“]/.test(raw) || /\s[А-ЯЁ][а-яё]{2,}/.test(raw) || CHAINS.test(raw);

/** The part's quantity is stated (grams, volume or a count), so the catalog can answer alone. */
const hasQuantity = (p: ParsedItem) => p.grams !== null || p.count !== null;

/**
 * Which parts to search the web for: only branded ones (a brand, a title, a shop or a cafe is
 * what a catalog and the AI cannot know), at most MAX_WEB_PARTS. Ordinary food needs no reference, and every
 * lookup makes the answer slower and the AI's message longer.
 */
export function pickWebParts(parts: ParsedItem[]): ParsedItem[] {
  return parts.filter((p) => looksBranded(p.raw)).slice(0, MAX_WEB_PARTS);
}

/** "мёдом", "сахаром", "маслом", "подливкой": one word in the instrumental case, no quantity. */
const ADD_ON = /^[а-яё]+(?:ом|ем|ой|ей|ами|ями)$/iu;
/** "ветчиной пятёрочка кафе": starts with such a word and goes on. */
const ADD_ON_FIRST = /^[а-яё]+(?:ом|ем|ой|ей|ами|ями)\s/iu;
/** The dish before already has "с …": "хачапури с сыром" and then "ветчиной …". */
const WITH_BEFORE = /(?<!\p{L})(?:с|со)\s+\p{L}+$/iu;
/** "салат из огурцов": the next fragment may be one more thing it is made of. */
const MADE_FROM = /(?<!\p{L})из\s+\p{L}+$/iu;
const PLURAL_FIRST = /^[а-яё]+(?:ов|ёв|ев|ей|ых|их)(?:\s|$)/iu;

/** The fragment goes on the dish before it ("кофе с молоком" + "сахаром"). */
export function continuesDish(prev: ParsedItem, p: ParsedItem): boolean {
  if (hasQuantity(p)) return false;
  const q = p.query.trim();
  return (
    ADD_ON.test(q) ||
    (ADD_ON_FIRST.test(q) && WITH_BEFORE.test(prev.query.trim())) ||
    (MADE_FROM.test(prev.query.trim()) && PLURAL_FIRST.test(q))
  );
}

/** A dish with the add-ons glued to it, and the fragments it was made of. */
export type PartGroup = { part: ParsedItem; members: ParsedItem[] };

/**
 * Fragments with add-ons glued to the dish before them: "кофе с молоком" + "сахаром" →
 * "кофе с молоком и сахаром". `include` limits it to some fragments (a fragment is glued only
 * to a neighbour that is included too).
 */
export function groupParts(
  parts: ParsedItem[],
  include: ReadonlySet<ParsedItem> = new Set(parts),
): PartGroup[] {
  const out: PartGroup[] = [];
  parts.forEach((p, i) => {
    if (!include.has(p)) return;
    const prev = parts[i - 1];
    const last = out[out.length - 1];
    if (prev && last && include.has(prev) && continuesDish(prev, p)) {
      last.part = {
        ...last.part,
        raw: `${last.part.raw.trim()} и ${p.raw.trim()}`,
        query: `${last.part.query} ${p.query}`,
      };
      last.members.push(p);
    } else out.push({ part: p, members: [p] });
  });
  return out;
}

/**
 * The parts the catalog could not answer, with add-ons glued to the dish before them, so the AI
 * sees "кофе с молоком и сахаром" and not two unrelated lines "кофе с молоком" and "сахаром".
 * A part is glued only to a neighbour that goes to the AI as well.
 */
export function groupAddOns(parts: ParsedItem[], rest: ReadonlySet<ParsedItem>): ParsedItem[] {
  return groupParts(parts, rest).map((g) => g.part);
}

/** Renumbers "[1] …" reference lines so numbers stay unique across several searches. */
export function renumber(text: string, offset: number): string {
  return text.replace(/^\[(\d+)\]/gm, (_m, n: string) => `[${Number(n) + offset}]`);
}

/**
 * The AI message: the fragments the catalog could not answer, each with its own web reference.
 * With `whole` the AI also gets the full description (so an add-on like sugar or honey is read
 * in its dish) and the list of what the catalog has already counted (so it is not repeated).
 */
export function partsMessage(
  parts: ParsedItem[],
  refs: Map<string, string>,
  whole?: { text: string; done: string[] },
): string {
  const lines = parts.map((p) => `- ${p.raw.trim()}`).join('\n');
  const head = whole
    ? `Приём пищи целиком: «${whole.text.trim()}».\n${
        whole.done.length ? `Уже посчитано по базе, не повторяй: ${whole.done.join('; ')}.\n` : ''
      }Оцени только эти позиции (добавки к блюду — сахар, мёд, масло, соус — относятся к блюду из описания):\n`
    : '';
  const refText = parts
    .filter((p) => refs.has(p.raw))
    .map((p) => `Справка для «${p.query}»:\n${refs.get(p.raw) ?? ''}`)
    .join('\n\n');
  if (!refText) return `${head}${lines}`;
  return `${head}${lines}\n\nСправка из интернета (результаты поиска, могут быть неточными или относиться к другому продукту). Для каждого продукта: если справка относится именно к нему — возьми из неё калорийность и БЖУ на 100 г, поставь "source": "web" и "sourceRef": номер справки [N], из которой взял цифры; если нет — игнорируй её и поставь "source": "estimate".\n${refText}`;
}

/**
 * "Описать" by parts. Each fragment of the description goes the cheapest way that is exact:
 * 1. a fragment with a stated quantity that matches the catalog is taken from the catalog;
 * 2. the others (add-ons glued to their dish) go to the AI together with the whole description
 *    and the list of what the catalog counted; only branded ones are looked up on the web
 *    (a few, in parallel). The AI estimates only them and says per item whether the numbers
 *    came from the web or are its own estimate.
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
  const mem = await loadMemory(r);
  const known: ReviewItem[] = [];
  const memory: MemoryPart[] = [];
  const done: string[] = [];
  const rest: ParsedItem[] = [];
  for (const g of groupParts(parts)) {
    // A phrase saved before comes back as it was saved, without the AI.
    const hit = recall(mem, g.part);
    if (hit) {
      const items = itemsFromMemory(hit, g.part);
      known.push(...items);
      memory.push(partOf(g.part, items));
      done.push(g.part.raw.trim());
      continue;
    }
    // A dish with add-ons goes to the AI whole; a plain fragment may be in the catalog.
    const p = g.members.length === 1 ? g.part : null;
    // A quantity makes the catalog enough; without one only a near-exact name does ("банан"),
    // and the usual portion of that food is taken.
    const m = p ? bestMatch(index, p.query) : null;
    if (p && m && m.similarity >= (hasQuantity(p) ? MATCH_THRESHOLD : EXACT_THRESHOLD)) {
      known.push({
        key: reviewKey(),
        name: m.item.name,
        grams: resolveGrams(p, m.item),
        per100g: m.item.per100g,
        foodId: m.item.id,
        source: 'catalog',
        confidence: hasQuantity(p) ? 'high' : 'medium',
      });
      done.push(p.raw.trim());
    } else rest.push(g.part);
  }

  // Everything is remembered or in the catalog: no AI and no web needed.
  if (parts.length > 0 && rest.length === 0) {
    return {
      items: known,
      entrySource: 'manual',
      analysis: 'local',
      date: at.date,
      time: at.time,
      ...(memory.length ? { memory } : {}),
    };
  }

  // Nothing could be split: the whole description goes through as one fragment.
  const split = rest.length > 0;
  const todo: ParsedItem[] = split
    ? rest
    : [{ raw: text.trim(), query: text.trim(), grams: null, count: null }];
  const toSearch = pickWebParts(todo);
  const found = await Promise.all(toSearch.map((p) => searchWeb(r, p.query)));
  const refs = new Map<string, string>();
  const sources: { title: string; url: string }[] = [];
  toSearch.forEach((p, i) => {
    const web = found[i];
    if (!web) return;
    refs.set(p.raw, renumber(web.text, sources.length));
    sources.push(...web.sources);
  });

  const { value, runId } = await runAi(r, {
    kind: 'text',
    vision: false,
    system: PROMPT_MEAL,
    content: [
      {
        type: 'text',
        text: partsMessage(todo, refs, split ? { text, done } : undefined),
      },
    ],
    validate: validateMeal,
  });
  const aiDraft = await mealToDraft(r, value, at, {
    entrySource: 'ai_text',
    aiRunId: runId,
    refs: sources,
  });
  // Each phrase the AI answered is remembered on save (with the user's corrections).
  const learned = split ? mapItemsToParts(todo, aiDraft.items) : [];
  const allMemory = [...memory, ...learned];
  return {
    ...aiDraft,
    items: [...known, ...aiDraft.items],
    ...(sources.length > 0 ? { sources } : {}),
    ...(allMemory.length ? { memory: allMemory } : {}),
  };
}

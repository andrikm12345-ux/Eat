import type { Repos } from '../db/repos';
import type { ParsedItem } from '../domain/mealText';
import { tokenize, tokenScore } from '../domain/search';
import type { Nutrients } from '../domain/types';
import { reviewKey, type ReviewItem } from '../state/review';

/**
 * Memory of the user's own phrases. When an AI estimate of "хачапури с сыром и ветчиной
 * пятёрочка кафе" is saved (with the user's corrections), the phrase is kept with what was
 * saved for it; the next time the same phrase comes back at once, without the AI.
 * Kept in settings, so it follows the account to every device.
 */
export const MEMORY_SETTING = 'mealMemory';
/** The oldest phrases are forgotten past this many. */
export const MEMORY_LIMIT = 400;

export type MemoryItem = {
  name: string;
  grams: number;
  per100g: Nutrients;
  piece?: { grams: number };
  foodId?: string;
};

export type MemoryEntry = {
  /** The phrase as the user wrote it the last time. */
  phrase: string;
  /** Portions in that phrase ("2 самсы" → 2), to scale the next time. */
  count: number;
  items: MemoryItem[];
  /** When it was last saved (the oldest are forgotten first). */
  at: string;
};

export type Memory = Record<string, MemoryEntry>;

/** Which review items came from which phrase (carried by the draft until it is saved). */
export type MemoryPart = { key: string; phrase: string; count: number; itemKeys: string[] };

/** The same words in any order, quantities already removed: "самса с курицей". */
export const memoryKey = (query: string): string => [...new Set(tokenize(query))].sort().join(' ');

export async function loadMemory(r: Repos): Promise<Memory> {
  const m = await r.settings.get<Memory>(MEMORY_SETTING, {});
  return m && typeof m === 'object' ? m : {};
}

/** The remembered entry for a parsed fragment, if this phrase was saved before. */
export function recall(mem: Memory, p: ParsedItem): MemoryEntry | undefined {
  const key = memoryKey(p.query);
  return key ? mem[key] : undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Review items for a remembered phrase, scaled to the quantity said now: grams for a single
 * item ("хачапури 150 г"), otherwise the number of portions ("2 самсы" after "самса").
 */
export function itemsFromMemory(e: MemoryEntry, p: ParsedItem): ReviewItem[] {
  const total = e.items.reduce((s, i) => s + i.grams, 0);
  const factor =
    p.grams !== null
      ? e.items.length === 1 || total <= 0
        ? null
        : p.grams / total
      : (p.count ?? 1) / (e.count || 1);
  return e.items.map((i) => ({
    key: reviewKey(),
    name: i.name,
    grams: factor === null ? round1(p.grams ?? i.grams) : round1(i.grams * factor),
    per100g: i.per100g,
    source: 'memory',
    confidence: 'high',
    ...(i.piece ? { piece: i.piece } : {}),
    ...(i.foodId ? { foodId: i.foodId } : {}),
  }));
}

/** A memory part for items made from a remembered phrase (saving again refreshes it). */
export function partOf(p: ParsedItem, items: ReviewItem[]): MemoryPart {
  return {
    key: memoryKey(p.query),
    phrase: p.raw.trim(),
    count: p.count ?? 1,
    itemKeys: items.map((i) => i.key),
  };
}

/**
 * Which AI items belong to which fragment, by shared words ("Томатный сок" ↔ "стакан томатного
 * сока"). With a single fragment everything is its own (hidden oil included). An item that
 * matches no fragment, or two equally, is left out: better not to remember than to mix up.
 */
export function mapItemsToParts(parts: ParsedItem[], items: ReviewItem[]): MemoryPart[] {
  if (parts.length === 0) return [];
  if (parts.length === 1) return [partOf(parts[0] as ParsedItem, items)];
  // Short words ("с", "и", "то") match the start of anything and say nothing.
  const words = (s: string) => tokenize(s).filter((w) => w.length >= 3);
  const partTokens = parts.map((p) => words(p.query));
  const owned = parts.map(() => [] as ReviewItem[]);
  for (const item of items) {
    const own = words(item.name);
    const scores = partTokens.map((pt) =>
      own.reduce((s, w) => s + Math.max(0, ...pt.map((t) => tokenScore(w, t))), 0),
    );
    const best = Math.max(...scores);
    if (best <= 0 || scores.filter((s) => s === best).length > 1) continue;
    owned[scores.indexOf(best)]?.push(item);
  }
  return parts.flatMap((p, i) => {
    const mine = owned[i] ?? [];
    return mine.length ? [partOf(p, mine)] : [];
  });
}

/**
 * Saves the phrases of a reviewed draft with what was finally saved for them (the user's
 * corrections included). A phrase whose items were all removed is not changed.
 */
export async function rememberParts(
  r: Repos,
  parts: readonly MemoryPart[],
  saved: readonly ReviewItem[],
  now = new Date(),
): Promise<void> {
  if (!parts.length) return;
  const byKey = new Map(saved.map((i) => [i.key, i]));
  const mem = await loadMemory(r);
  let changed = false;
  for (const p of parts) {
    if (!p.key) continue;
    const items = p.itemKeys
      .map((k) => byKey.get(k))
      .filter((i): i is ReviewItem => !!i && i.grams > 0);
    if (!items.length) continue;
    mem[p.key] = {
      phrase: p.phrase,
      count: p.count,
      at: now.toISOString(),
      items: items.map((i) => ({
        name: i.name,
        grams: i.grams,
        per100g: i.per100g,
        ...(i.piece && i.piece.grams > 0 ? { piece: i.piece } : {}),
        ...(i.foodId ? { foodId: i.foodId } : {}),
      })),
    };
    changed = true;
  }
  if (!changed) return;
  // The most recently saved phrases are kept, the oldest are forgotten.
  const kept = Object.entries(mem)
    .sort(([, a], [, b]) => b.at.localeCompare(a.at))
    .slice(0, MEMORY_LIMIT);
  await r.settings.set(MEMORY_SETTING, Object.fromEntries(kept));
}

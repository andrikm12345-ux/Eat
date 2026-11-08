import { normalizeSearch } from './text';

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const EN_TO_RU = new Map([...EN].map((c, i) => [c, RU[i] as string]));
const RU_TO_EN = new Map([...RU].map((c, i) => [c, EN[i] as string]));

/** Converts text typed in the wrong keyboard layout (ЙЦУКЕН ↔ QWERTY). */
export function swapLayout(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += EN_TO_RU.get(ch) ?? RU_TO_EN.get(ch) ?? ch;
  return out;
}

/** Normalized tokens: lower case, ё→е, punctuation removed (keeps digits, %, letters). */
export function tokenize(s: string): string[] {
  return normalizeSearch(s)
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

// Reused buffers for editDistance (search runs synchronously on the main thread).
let rowA = new Uint16Array(64);
let rowB = new Uint16Array(64);

/** Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (b.length + 1 > rowA.length) {
    rowA = new Uint16Array(b.length + 1);
    rowB = new Uint16Array(b.length + 1);
  }
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[b.length] as number;
}

/** Case, number and gender endings of Russian nouns and adjectives, the longest first. */
const ENDINGS =
  /(?:ого|его|ому|ему|ыми|ими|ами|ями|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ых|их|ым|им|ую|юю|ом|ем|ам|ям|ах|ях|ов|ев|а|я|о|е|ы|и|у|ю|ь|й)$/u;

/**
 * The stem of a word without its ending: "яйца" and "яйцо" → "яйц", "варёных" and "варёное" →
 * "варен", "апельсинового" and "апельсиновый" → "апельсинов", "мёда" → "мед".
 */
export function stemOf(w: string): string {
  return w.length > 3 ? w.replace(ENDINGS, '') : w;
}

/** The same words in another order: "Томатный сок" is "Сок томатный". */
const sortedKey = (key: string) => key.split(' ').sort().join(' ');

/** The name in stems: "тарелка борща" and "Борщ" share "борщ". */
const stemKey = (key: string) => key.split(' ').map(stemOf).join(' ');

/** How well one query token matches one name token (0 = no match). */
export function tokenScore(q: string, t: string): number {
  if (t === q) return 3;
  // The same word in another form (case, number, gender).
  if (q.length >= 3 && t.length >= 3 && (q.length > 3 || t.length > 3)) {
    const sq = stemOf(q);
    if (sq.length >= 3 && sq === stemOf(t)) return 2.5;
  }
  if (t.startsWith(q)) return 2;
  if (q.length >= 3 && t.includes(q)) return 1.5;
  // Typos are tolerated after the first letter (cheap pre-filter for speed); not in short words,
  // where one wrong letter makes another food ("плов" → "пломбир", "борщ" → "бородинский").
  if (q.length >= 5 && q.charCodeAt(0) === t.charCodeAt(0)) {
    const max = q.length >= 7 ? 2 : 1;
    // Compare against the token prefix of similar length (typo while typing).
    const head = t.slice(0, q.length);
    if (editDistance(q, head, max) <= max || editDistance(q, t, max) <= max) return 1;
  }
  return 0;
}

export type SearchItem = {
  id: string;
  name: string;
  brand?: string;
  useCount: number;
  lastUsedAt?: string;
  verified: boolean;
};

export type IndexedItem<T extends SearchItem> = { item: T; tokens: string[]; key: string };

export function buildIndex<T extends SearchItem>(items: readonly T[]): IndexedItem<T>[] {
  return items.map((item) => {
    const text = item.brand ? `${item.name} ${item.brand}` : item.name;
    return { item, tokens: tokenize(text), key: tokenize(item.name).join(' ') };
  });
}

/** Text relevance of an indexed item for query tokens; 0 when any token is unmatched. */
export function matchScore(
  qTokens: readonly string[],
  qKey: string,
  ix: { tokens: string[]; key: string },
): number {
  let sum = 0;
  for (const q of qTokens) {
    let best = 0;
    for (const t of ix.tokens) {
      const s = tokenScore(q, t);
      if (s > best) best = s;
      if (best === 3) break;
    }
    if (best === 0) return 0;
    sum += best;
  }
  let score = sum / qTokens.length;
  if (ix.key === qKey || sortedKey(ix.key) === sortedKey(qKey)) score += 2;
  else if (stemKey(ix.key) === stemKey(qKey)) score += 1.5;
  else if (ix.key.startsWith(qKey)) score += 1;
  return score;
}

const DAY_MS = 86_400_000;

/** Usage-based boost: frequency, recency (≤ 30 days) and verified data. */
export function usageBoost(item: SearchItem, nowMs: number): number {
  let b = Math.log2(1 + item.useCount) * 0.6;
  if (item.lastUsedAt) {
    const days = (nowMs - Date.parse(item.lastUsedAt)) / DAY_MS;
    if (days >= 0 && days < 30) b += 1.5 * (1 - days / 30);
  }
  if (item.verified) b += 0.5;
  return b;
}

/**
 * Fuzzy search: tolerant to ё/е, wrong keyboard layout, word order and small typos.
 * Ranking = text relevance × 4 + usage boost.
 */
export function search<T extends SearchItem>(
  index: readonly IndexedItem<T>[],
  query: string,
  opts: { limit?: number; nowMs?: number } = {},
): T[] {
  const limit = opts.limit ?? 50;
  const nowMs = opts.nowMs ?? Date.now();
  const variants = [tokenize(query), tokenize(swapLayout(query))].filter((v) => v.length > 0);
  if (variants.length === 0) return [];
  const scored: { item: T; score: number }[] = [];
  for (const ix of index) {
    let text = 0;
    for (const v of variants) {
      const s = matchScore(v, v.join(' '), ix);
      if (s > text) text = s;
    }
    // Fewer extra words in the name rank higher (numbers like "3,2%" do not count): "молока" is
    // "Молоко 3,2%", not "Кофе с молоком" or "Миндальное молоко".
    const words = variants[0]?.length ?? 1;
    const nameWords = ix.tokens.filter((t) => /\p{L}/u.test(t)).length;
    const fit = words / Math.max(words, nameWords);
    if (text > 0)
      scored.push({ item: ix.item, score: text * 4 + fit * 2 + usageBoost(ix.item, nowMs) });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ru'));
  return scored.slice(0, limit).map((s) => s.item);
}

/** Similarity in [0, 1] of one indexed item to a hint (1 = exact name). */
export function similarity<T extends SearchItem>(ix: IndexedItem<T>, hint: string): number {
  const q = tokenize(hint);
  if (!q.length) return 0;
  const raw = matchScore(q, q.join(' '), ix);
  if (!raw) return 0;
  const coverage = q.length / Math.max(q.length, ix.tokens.length);
  return Math.min(1, (raw / 5) * (0.5 + 0.5 * coverage));
}

/** Best verified match for a hint with similarity in [0, 1] (1 = exact name). */
export function bestMatch<T extends SearchItem>(
  index: readonly IndexedItem<T>[],
  hint: string,
): { item: T; similarity: number } | null {
  const q = tokenize(hint);
  if (!q.length) return null;
  const key = q.join(' ');
  let best: { item: T; similarity: number } | null = null;
  for (const ix of index) {
    if (!ix.item.verified) continue;
    // Exact tokens (3 each) + exact key bonus (2) = 5 at most; extra name words lower it.
    const raw = matchScore(q, key, ix);
    if (!raw) continue;
    const coverage = q.length / Math.max(q.length, ix.tokens.length);
    const similarity = Math.min(1, (raw / 5) * (0.5 + 0.5 * coverage));
    if (!best || similarity > best.similarity) best = { item: ix.item, similarity };
  }
  return best;
}

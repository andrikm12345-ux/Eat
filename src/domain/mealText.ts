/** Local (no AI) parsing of a free-form meal description. */

export type ParsedItem = {
  /** Original fragment. */
  raw: string;
  /** Food words to search for (quantities and filler removed). */
  query: string;
  /** Explicit weight/volume in grams (ml ≈ g). */
  grams: number | null;
  /** "2 яйца", "3 шт": a count of pieces/portions. */
  count: number | null;
};

const U = '(?![\\p{L}])';
// Longest alternatives first so "гр" wins over "г", "ст. л." over "с".
const UNIT_RE = new RegExp(
  '(\\d+(?:[.,]\\d+)?)\\s*(' +
    [
      'килограмм\\p{L}*',
      'кг',
      'грамм\\p{L}*',
      'гр',
      'г',
      'миллилитр\\p{L}*',
      'мл',
      'литр\\p{L}*',
      'л',
      'ст\\.?\\s*л',
      'столов\\p{L}*\\s+ложк\\p{L}*',
      'ч\\.?\\s*л',
      'чайн\\p{L}*\\s+ложк\\p{L}*',
      'стакан\\p{L}*',
      'чашк\\p{L}*',
      'штук\\p{L}*',
      'шт',
      'кусоч\\p{L}*',
      'кус\\p{L}*',
      'ломт\\p{L}*',
      'порци\\p{L}*',
    ].join('|') +
    ')?\\.?' +
    U,
  'giu',
);

const FACTORS: [RegExp, number | 'count'][] = [
  [/^кило|^кг/i, 1000],
  [/^гр|^г$/i, 1],
  [/^милли|^мл/i, 1],
  [/^лит|^л$/i, 1000],
  [/^стакан/i, 250],
  [/^чашк/i, 240],
  [/^ст\.?\s*л|^столов/i, 15],
  [/^ч\.?\s*л|^чайн/i, 5],
];

const FILLER =
  /(^|\s)(?:около|примерно|приблизительно|немного|ещё|еще|съел[аи]?|выпил[аи]?|поел[аи]?|на завтрак|на обед|на ужин|на перекус|утром|днём|вечером|сегодня)(?=\s|$)/giu;

const clean = (s: string) =>
  s
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
    .replace(/^(?:и|с|со|на)\s+/iu, '')
    .trim();

/** Splits on commas, semicolons, line breaks, " и ", " + ", " плюс ". */
export function splitMeal(text: string): string[] {
  return text
    .split(/[,;\n]+|\s+и\s+|\s+\+\s+|\s+плюс\s+/iu)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function parsePart(raw: string): ParsedItem | null {
  let grams: number | null = null;
  let count: number | null = null;
  let rest = raw;
  UNIT_RE.lastIndex = 0;
  for (const m of raw.matchAll(UNIT_RE)) {
    const start = m.index as number;
    const end = start + m[0].length;
    const unit = m[2];
    // "5%" / "3,2 %" is part of the product name, not a quantity.
    if (!unit && /^\s*%/.test(raw.slice(end))) continue;
    const n = Number((m[1] as string).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    const factor = unit ? FACTORS.find(([re]) => re.test(unit.trim()))?.[1] : undefined;
    if (factor !== undefined && factor !== 'count') grams = n * factor;
    else count = n;
    rest = raw.slice(0, start) + ' ' + raw.slice(end);
    break;
  }
  const query = clean(rest);
  return query.length >= 2 ? { raw, query, grams, count } : null;
}

export function parseMealText(text: string): ParsedItem[] {
  return splitMeal(text)
    .map(parsePart)
    .filter((p): p is ParsedItem => p !== null);
}

/** Grams for a parsed item given the matched food's servings and last used grams. */
export function resolveGrams(
  p: Pick<ParsedItem, 'grams' | 'count'>,
  food: { servings: { label: string; grams: number }[]; lastGrams?: number | undefined },
): number {
  if (p.grams !== null) return Math.round(p.grams * 10) / 10;
  const piece =
    food.servings.find((s) => /шт|штук|кус|ломт|порц|яйц/i.test(s.label)) ?? food.servings[0];
  if (p.count !== null) return Math.round(p.count * (piece?.grams ?? 100) * 10) / 10;
  return food.lastGrams ?? piece?.grams ?? 100;
}

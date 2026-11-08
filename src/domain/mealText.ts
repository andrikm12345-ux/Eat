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
      'ложк\\p{L}*',
      'стакан\\p{L}*',
      'чашк\\p{L}*',
      'штук\\p{L}*',
      'шт',
      'кусоч\\p{L}*',
      'кус\\p{L}*',
      'ломт\\p{L}*',
      'порци\\p{L}*',
      'тарелк\\p{L}*',
      'миск\\p{L}*',
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
  [/^тарелк|^миск/i, 250],
  [/^ст\.?\s*л|^столов/i, 15],
  [/^ч\.?\s*л|^чайн/i, 5],
];

/** "Ложка" without "чайная"/"столовая": a teaspoon of sugar or honey, a tablespoon of the rest. */
const spoonGrams = (text: string) =>
  /сахар|соль|соли/iu.test(text) ? 5 : /м[её]д|варень|джем|сироп/iu.test(text) ? 8 : 15;

const FILLER =
  /(^|\s)(?:около|примерно|приблизительно|немного|ещё|еще|съел[аи]?|выпил[аи]?|поел[аи]?|на завтрак|на обед|на ужин|на перекус|утром|днём|вечером|сегодня)(?=\s|$)/giu;

const clean = (s: string) =>
  s
    // "днём бизнес-ланч: суп" → "суп": a label before a colon is not food.
    .replace(/^[^:]{1,40}:\s*/u, '')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
    .replace(/^(?:и|с|со|на)\s+/iu, '')
    .trim();

/**
 * Splits on commas (not the decimal one in "0,5"), semicolons, line breaks, " и ", " + ",
 * " плюс ". A name with "и" inside ("Вкусно и точка") stays whole.
 */
export function splitMeal(text: string): string[] {
  return text
    .replace(/вкусно\s+и\s+точка/giu, 'Вкусно-и-точка')
    .split(/(?:(?<!\d),|,(?!\d))+|[;\n]+|\s+и\s+|\s+\+\s+|\s+плюс\s+/iu)
    .map((p) => p.trim())
    .filter(Boolean);
}

const WORD_NUMBERS: [RegExp, string][] = [
  [/полтора|полторы/, '1.5'],
  [/пол|половина|половину|половинку/, '0.5'],
  [/пару|пара|пары/, '2'],
  [/один|одна|одно|одну/, '1'],
  [/два|две/, '2'],
  [/три/, '3'],
  [/четыре/, '4'],
  [/пять/, '5'],
  [/шесть/, '6'],
  [/семь/, '7'],
  [/восемь/, '8'],
  [/девять/, '9'],
  [/десять/, '10'],
];

/** "два яйца" → "2 яйца": a number written in words before a food word. */
export function numberWordsToDigits(s: string): string {
  const withNumbers = s.replace(/(^|\s)([а-яё]+)(?=\s+[а-яё])/giu, (m, pre: string, w: string) => {
    const hit = WORD_NUMBERS.find(([re]) => new RegExp(`^(?:${re.source})$`, 'iu').test(w));
    return hit ? `${pre}${hit[1]}` : m;
  });
  // "ложка мёда", "столовая ложка сметаны" without a number is one spoon.
  const spoons = withNumbers.replace(
    /(^|\s)((?:чайн\p{L}*|столов\p{L}*)\s+)?(ложк\p{L}*)(?=\s|$)/giu,
    (m, pre: string, kind: string | undefined, w: string, offset: number) =>
      /\d\s*$/.test(withNumbers.slice(0, offset + pre.length)) ? m : `${pre}1 ${kind ?? ''}${w}`,
  );
  // "тарелку", "миска", "стакан", "кусок" without a number is one of them.
  return spoons.replace(
    /(^|\s)(тарелк\p{L}*|миск\p{L}*|стакан\p{L}*|чашк\p{L}*|кусо[кч]\p{L}*|ломт\p{L}*|порци\p{L}*)(?=\s|$)/giu,
    (m, pre: string, w: string, offset: number) =>
      /\d\s*$/.test(spoons.slice(0, offset + pre.length)) ? m : `${pre}1 ${w}`,
  );
}

/** Drinks measured in litres: "пиво 0,5" means half a litre, not half a piece. */
const LIQUID =
  /(пив|молок|сок|чай|кофе|вод[аыуе]|кефир|вино|компот|кола|колу|лимонад|ряженк|морс|квас)/iu;

export function parsePart(source: string): ParsedItem | null {
  const raw = source;
  source = numberWordsToDigits(source);
  let grams: number | null = null;
  let count: number | null = null;
  let rest = source;
  UNIT_RE.lastIndex = 0;
  for (const m of source.matchAll(UNIT_RE)) {
    const start = m.index as number;
    const end = start + m[0].length;
    const unit = m[2];
    // "5%" / "3,2 %" is part of the product name, not a quantity.
    if (!unit && /^\s*%/.test(source.slice(end))) continue;
    const n = Number((m[1] as string).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    const factor = !unit
      ? undefined
      : /^ложк/iu.test(unit.trim())
        ? spoonGrams(source)
        : FACTORS.find(([re]) => re.test(unit.trim()))?.[1];
    if (factor !== undefined && factor !== 'count') grams = n * factor;
    else if (!unit && !Number.isInteger(n) && LIQUID.test(source)) grams = n * 1000;
    else count = n;
    rest = source.slice(0, start) + ' ' + source.slice(end);
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

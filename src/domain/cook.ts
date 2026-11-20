/**
 * «Что приготовить»: which dishes can really be cooked from what is at home.
 *
 * The AI only proposes dishes with their full ingredient lists. Everything that decides what is
 * shown is here, without the AI: each ingredient is matched to the products the person listed
 * (forms of words, synonyms, "курица" = "куриное филе", but "масло сливочное" ≠ "масло
 * растительное"), amounts are compared, dishes without their main ingredient or with too much
 * to buy are dropped, and the rest are ranked.
 */
import { parseMealText } from './mealText';
import { scaleNutrients, sumNutrients } from './nutrients';
import { stemOf, tokenize } from './search';
import type { Nutrients } from './types';

/** A product the person has: "курица 500 г", "2 яйца", "лук". */
export type PantryItem = { name: string; grams: number | null; count: number | null };

/** One ingredient of a proposed dish, for ONE serving. */
export type DishIngredient = {
  name: string;
  grams: number;
  per100g: Nutrients;
  /** Countable products: pieces per serving and the weight of one. */
  pieces?: number;
  pieceGrams?: number;
  /** Can be left out (herbs to serve, a garnish): never counts as missing. */
  optional?: boolean;
};

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A dish the AI proposed: ingredients per one serving. */
export type DishIdea = {
  name: string;
  minutes: number;
  difficulty: Difficulty;
  /** Weight of one ready serving on the plate (drained cooking water not included). */
  portionGrams?: number;
  ingredients: DishIngredient[];
};

export type IngredientStatus = 'have' | 'short' | 'basic' | 'missing' | 'optional';

export type CheckedIngredient = DishIngredient & {
  status: IngredientStatus;
  /** Which pantry item covers it. */
  pantryIndex?: number;
  /** Grams needed for the chosen number of servings. */
  needGrams: number;
  /** Grams (or pieces) the person has, when they said how much. */
  have?: { grams?: number; pieces?: number };
};

export type RejectReason = 'main' | 'tooMany' | 'noBuy' | 'unused' | 'time' | 'duplicate';

export type CheckedDish = {
  idea: DishIdea;
  ingredients: CheckedIngredient[];
  /** Names of what is missing / not enough (not optional, not basic). */
  missing: string[];
  short: string[];
  /** The heaviest real ingredient (the base of the dish). */
  main: string | null;
  mainMissing: boolean;
  /** How many of the person's products the dish uses. */
  usedPantry: number;
  /** Share of the dish's real ingredients (by weight) the person has: 0…1. */
  haveShare: number;
};

export type CookFilters = {
  /** Most minutes in all; null = any. */
  maxMinutes: number | null;
  /** Nothing to buy: a dish with anything missing or short is dropped. */
  noBuy: boolean;
  /** Salt, pepper, sugar, oil, water, dry spices are at home. */
  basics: boolean;
  servings: number;
};

// ---------------------------------------------------------------------------------------------
// Words → comparable keys

/** Words that say nothing about WHAT the product is. */
const STOP = new Set(['и', 'с', 'со', 'в', 'во', 'на', 'для', 'по', 'из', 'или', 'к', 'от', 'до']);

/**
 * How the product is prepared or cut, its size or freshness: "курица" and "курица варёная" are the
 * same product at home. ("сырой" is listed in full: its stem "сыр" is cheese.)
 */
const DESCRIPTOR_WORDS = [
  'свежий',
  'свежая',
  'свежие',
  'свежего',
  'варёный',
  'вареный',
  'варёная',
  'вареная',
  'варёные',
  'вареные',
  'отварной',
  'отварная',
  'отварные',
  'жареный',
  'жареная',
  'жареные',
  'сырой',
  'сырая',
  'сырое',
  'сырые',
  'сырого',
  'сырых',
  'замороженный',
  'замороженная',
  'замороженные',
  'охлаждённый',
  'охлажденный',
  'охлаждённая',
  'охлажденная',
  'крупный',
  'крупная',
  'крупные',
  'мелкий',
  'мелкая',
  'мелкие',
  'средний',
  'средняя',
  'средние',
  'небольшой',
  'небольшая',
  'большой',
  'большая',
  'молодой',
  'молодая',
  'репчатый',
  'репчатого',
  'белокочанная',
  'белокочанной',
  'твёрдый',
  'твердый',
  'твёрдого',
  'твердого',
  'домашний',
  'домашняя',
  'натуральный',
  'натуральная',
  'крупа',
  'крупы',
  'измельчённый',
  'измельченный',
  'нарезанный',
  'тёртый',
  'тертый',
  'молотый',
  'молотая',
  'молотого',
  'целый',
  'целая',
  'очищенный',
  'очищенная',
  'вкусу',
  'подачи',
  'жарки',
  'украшения',
  'штука',
  'штуки',
  'шт',
  'кусок',
  'куска',
  'долька',
  'дольки',
  'зубчик',
  'зубчика',
  'зубчики',
  'пучок',
  'щепотка',
];

/** Different words for the same product → one name. */
const SYNONYMS: [string, string[]][] = [
  [
    'курица',
    [
      'курица',
      'курицы',
      'куриный',
      'куриная',
      'куриное',
      'куриные',
      'цыплёнок',
      'цыпленок',
      'бройлер',
    ],
  ],
  ['филе', ['филе', 'грудка', 'грудки', 'грудку']],
  ['помидор', ['помидор', 'помидоры', 'помидора', 'томат', 'томаты', 'томата']],
  ['картофель', ['картофель', 'картошка', 'картошки', 'картофелина', 'картофелины']],
  ['морковь', ['морковь', 'морковка', 'моркови', 'морковки']],
  ['свекла', ['свекла', 'свёкла', 'свеклы', 'свёклы']],
  ['говядина', ['говядина', 'говядины', 'говяжий', 'говяжья', 'говяжье']],
  ['свинина', ['свинина', 'свинины', 'свиной', 'свиная', 'свиные']],
  ['гречка', ['гречка', 'гречки', 'гречневая', 'гречневой', 'гречневые']],
  [
    'макароны',
    [
      'макароны',
      'макарон',
      'спагетти',
      'вермишель',
      'рожки',
      'перья',
      'пенне',
      'фузилли',
      'фарфалле',
      'лапша',
    ],
  ],
  ['яйцо', ['яйцо', 'яйца', 'яиц']],
  [
    'растительное',
    ['растительное', 'растительного', 'подсолнечное', 'подсолнечного', 'оливковое', 'оливкового'],
  ],
  ['хлеб', ['хлеб', 'хлеба', 'батон', 'батона']],
  ['гриб', ['гриб', 'грибы', 'грибов', 'шампиньон', 'шампиньоны', 'шампиньонов']],
  ['сыр', ['сыр', 'сыра', 'сыром']],
  ['творог', ['творог', 'творога', 'творожок']],
  ['огурец', ['огурец', 'огурцы', 'огурца', 'огурцов']],
  ['кабачок', ['кабачок', 'кабачки', 'кабачка', 'цукини']],
  ['фарш', ['фарш', 'фарша']],
  ['лук', ['лук', 'лука', 'луковица', 'луковицы', 'луковицу']],
  ['чеснок', ['чеснок', 'чеснока']],
  ['сметана', ['сметана', 'сметаны']],
  ['молоко', ['молоко', 'молока']],
];

/**
 * Words that make another product of the same name: with one of them in the recipe, "молоко" at
 * home is not "кокосовое молоко", "сыр" is not "плавленый сыр", "капуста" is not "цветная".
 */
const KIND_WORDS = [
  'кокосовое',
  'кокосового',
  'миндальное',
  'соевое',
  'соевый',
  'сгущённое',
  'сгущенное',
  'сгущёнка',
  'сухое',
  'цветная',
  'цветной',
  'брюссельская',
  'пекинская',
  'морская',
  'квашеная',
  'квашеной',
  'зелёный',
  'зеленый',
  'зелёного',
  'зеленого',
  'томатная',
  'томатной',
  'томатный',
  'сливочное',
  'сливочного',
  'плавленый',
  'плавленого',
  'творожный',
  'копчёный',
  'копченый',
  'копчёная',
  'копченая',
  'консервированный',
  'консервированная',
  'консервированные',
  'солёный',
  'соленый',
  'солёные',
  'соленые',
  'маринованный',
  'маринованные',
  'сушёный',
  'сушеный',
  'сушёные',
  'сушеные',
  'рисовая',
  'рисовой',
  'яичная',
  'яичной',
  'фасолевая',
  'тыквенные',
];

const key = (w: string) => stemOf(w.toLowerCase().replace(/ё/g, 'е'));

const DESCRIPTORS = new Set(DESCRIPTOR_WORDS.map((w) => w.toLowerCase().replace(/ё/g, 'е')));
const CANON = new Map<string, string>();
for (const [canon, words] of SYNONYMS) for (const w of words) CANON.set(key(w), key(canon));
const KINDS = new Set(KIND_WORDS.map(key));

/** The words that say what the product is, as comparable stems. */
export function productKey(name: string): string[] {
  const words = tokenize(name).filter(
    (t) => !/\d/.test(t) && !STOP.has(t) && !DESCRIPTORS.has(t) && t.length > 1,
  );
  // "паста" alone is pasta; in "томатная паста" it is something else.
  if (words.length === 1 && words[0] === 'паста') return [key('макароны')];
  const out: string[] = [];
  for (const w of words) {
    const k = key(w);
    const c = CANON.get(k) ?? k;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

const subset = (a: readonly string[], b: readonly string[]) => a.every((x) => b.includes(x));

/**
 * Is what the recipe asks for the product the person has? The same words in any form and order,
 * or one name inside the other ("курица" ↔ "куриное филе"), unless the recipe's extra word makes
 * another product ("молоко" ↛ "кокосовое молоко").
 * Returns how close (lower is better) or null for no match.
 */
export function matchDistance(recipe: readonly string[], pantry: readonly string[]): number | null {
  if (!recipe.length || !pantry.length) return null;
  if (subset(pantry, recipe)) {
    const extra = recipe.filter((x) => !pantry.includes(x));
    if (extra.some((x) => KINDS.has(x))) return null;
    return extra.length;
  }
  if (subset(recipe, pantry)) return pantry.length - recipe.length;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Basics

const has = (k: readonly string[], w: string) => k.includes(key(w));

/** Salt, black pepper, sugar, vegetable oil, water, dry spices and bay leaf. */
export function isBasic(name: string): boolean {
  const k = productKey(name);
  if (!k.length) return false;
  if (has(k, 'соль') && k.length <= 2) return true;
  if (has(k, 'перец') && (has(k, 'черный') || has(k, 'душистый'))) return true;
  if (has(k, 'сахар') && k.length === 1) return true;
  if (has(k, 'вода') && k.length <= 2 && !has(k, 'минеральная')) return true;
  if (has(k, 'масло') && (k.length === 1 || (k.length === 2 && has(k, 'растительное'))))
    return true;
  if (has(k, 'лавровый') || has(k, 'специи') || has(k, 'приправа') || has(k, 'приправы'))
    return true;
  return ['паприка', 'куркума', 'зира', 'орегано', 'хмели', 'карри'].some((s) => has(k, s));
}

// ---------------------------------------------------------------------------------------------
// The pantry

/** "курица 500 г, 2 яйца, лук" → products with amounts (the same product said twice is summed). */
export function parsePantry(text: string): PantryItem[] {
  const out: PantryItem[] = [];
  for (const p of parseMealText(text)) {
    const name = p.query.replace(/\s+/g, ' ').trim();
    if (!productKey(name).length) continue;
    const same = out.find((o) => productKey(o.name).join(' ') === productKey(name).join(' '));
    if (!same) {
      out.push({ name, grams: p.grams, count: p.count });
      continue;
    }
    if (same.grams !== null && p.grams !== null) same.grams += p.grams;
    else if (same.count !== null && p.count !== null) same.count += p.count;
  }
  return out;
}

/** The pantry back into one line (what the field shows after a chip is removed). */
export const pantryText = (items: readonly PantryItem[]) =>
  items
    .map((i) =>
      i.grams !== null
        ? `${i.name} ${Math.round(i.grams)} г`
        : i.count !== null
          ? `${i.name} ${i.count} шт`
          : i.name,
    )
    .join(', ');

// ---------------------------------------------------------------------------------------------
// Checking a dish

const SHORT_SLACK = 1.1;

function amountCheck(
  ing: DishIngredient,
  item: PantryItem,
  servings: number,
): Pick<CheckedIngredient, 'status' | 'have'> {
  const need = ing.grams * servings;
  if (item.grams !== null) {
    return {
      status: need > item.grams * SHORT_SLACK + 5 ? 'short' : 'have',
      have: { grams: item.grams },
    };
  }
  if (item.count !== null) {
    if (ing.pieces) {
      return {
        status: ing.pieces * servings > item.count + 0.01 ? 'short' : 'have',
        have: { pieces: item.count },
      };
    }
    if (ing.pieceGrams) {
      const grams = item.count * ing.pieceGrams;
      return { status: need > grams * SHORT_SLACK + 5 ? 'short' : 'have', have: { grams } };
    }
  }
  // "курица" without an amount: taken as enough.
  return { status: 'have' };
}

/** Matches every ingredient of a dish to the pantry and sums up what is there and what is not. */
export function checkDish(
  idea: DishIdea,
  pantry: readonly PantryItem[],
  f: Pick<CookFilters, 'basics' | 'servings'>,
): CheckedDish {
  const keys = pantry.map((p) => productKey(p.name));
  const ingredients: CheckedIngredient[] = idea.ingredients.map((ing) => {
    const needGrams = Math.round(ing.grams * f.servings * 10) / 10;
    const k = productKey(ing.name);
    let best: { i: number; d: number } | null = null;
    keys.forEach((pk, i) => {
      const d = matchDistance(k, pk);
      if (d !== null && (!best || d < best.d)) best = { i, d };
    });
    const hit = best as { i: number; d: number } | null;
    if (hit) {
      return {
        ...ing,
        needGrams,
        pantryIndex: hit.i,
        ...amountCheck(ing, pantry[hit.i] as PantryItem, f.servings),
      };
    }
    if (f.basics && isBasic(ing.name)) return { ...ing, needGrams, status: 'basic' };
    if (ing.optional) return { ...ing, needGrams, status: 'optional' };
    return { ...ing, needGrams, status: 'missing' };
  });
  const real = ingredients.filter((i) => i.status !== 'basic' && i.status !== 'optional');
  const mainIng = [...real].sort((a, b) => b.grams - a.grams)[0];
  const weight = real.reduce((s, i) => s + i.grams, 0);
  const haveWeight = real.reduce(
    (s, i) => s + (i.status === 'have' ? i.grams : i.status === 'short' ? i.grams / 2 : 0),
    0,
  );
  return {
    idea,
    ingredients,
    missing: real.filter((i) => i.status === 'missing').map((i) => i.name),
    short: real.filter((i) => i.status === 'short').map((i) => i.name),
    main: mainIng?.name ?? null,
    mainMissing: mainIng?.status === 'missing',
    usedPantry: new Set(
      ingredients.flatMap((i) => (i.pantryIndex === undefined ? [] : [i.pantryIndex])),
    ).size,
    haveShare: weight > 0 ? haveWeight / weight : 0,
  };
}

/** At most this many things to buy for a dish to be offered at all. */
export const MAX_MISSING = 2;

/** Why a dish is not offered (null = it is). */
export function rejectReason(d: CheckedDish, f: CookFilters): RejectReason | null {
  if (f.maxMinutes !== null && d.idea.minutes > f.maxMinutes) return 'time';
  if (d.usedPantry === 0) return 'unused';
  if (d.mainMissing) return 'main';
  if (f.noBuy && (d.missing.length > 0 || d.short.length > 0)) return 'noBuy';
  if (d.missing.length > MAX_MISSING) return 'tooMany';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Ranking

export type RankedDish = CheckedDish & {
  /** Per one serving, from the product catalog where possible. */
  perServing: Nutrients;
  score: number;
};

/** What is left of the day (null when there is no goal or it is not today). */
export type DayLeft = { kcal: number; protein: number } | null;

export function scoreDish(
  d: CheckedDish,
  perServing: Nutrients,
  pantrySize: number,
  left: DayLeft,
) {
  let s = 4 * d.haveShare - 1.2 * d.missing.length - 0.6 * d.short.length;
  s += Math.min(1, d.usedPantry / Math.max(1, Math.min(pantrySize, 4)));
  if (left && left.kcal >= 150) {
    if (perServing.kcal > left.kcal * 1.05 + 20) s -= 1.5;
    if (left.protein > 5) s += 0.5 * Math.min(1, perServing.protein / left.protein);
  }
  s -= 0.2 * (Math.min(d.idea.minutes, 120) / 60);
  return s;
}

/** The same dish twice ("Омлет" and "Омлет с сыром" count once: the better one stays). */
const dishKey = (name: string) => productKey(name);
function sameDish(a: string, b: string): boolean {
  const ka = dishKey(a);
  const kb = dishKey(b);
  if (!ka.length || !kb.length) return false;
  if (ka.join(' ') === kb.join(' ')) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return short.length === 1 && long[0] === short[0];
}

/**
 * The dishes to show: checked, filtered, scored, without repeats, best first.
 * `nutrition` gives the per-serving values of a dish (the catalog lookup lives outside).
 */
export function pickDishes(
  ideas: readonly DishIdea[],
  pantry: readonly PantryItem[],
  f: CookFilters,
  left: DayLeft,
  nutrition: (idea: DishIdea) => Nutrients,
  limit = 6,
): { shown: RankedDish[]; rejected: { name: string; reason: RejectReason; missing: string[] }[] } {
  const rejected: { name: string; reason: RejectReason; missing: string[] }[] = [];
  const ok: RankedDish[] = [];
  for (const idea of ideas) {
    const d = checkDish(idea, pantry, f);
    const reason = rejectReason(d, f);
    if (reason) {
      rejected.push({ name: idea.name, reason, missing: d.missing });
      continue;
    }
    const perServing = nutrition(idea);
    ok.push({ ...d, perServing, score: scoreDish(d, perServing, pantry.length, left) });
  }
  ok.sort((a, b) => b.score - a.score);
  const shown: RankedDish[] = [];
  for (const d of ok) {
    if (shown.some((s) => sameDish(s.idea.name, d.idea.name))) {
      rejected.push({ name: d.idea.name, reason: 'duplicate', missing: d.missing });
      continue;
    }
    if (shown.length < limit) shown.push(d);
  }
  return { shown, rejected };
}

/** Totals of a dish for `servings` servings from per-100 g values of its ingredients. */
export function dishTotals(
  ingredients: readonly { grams: number; per100g: Nutrients }[],
  servings = 1,
): Nutrients {
  return sumNutrients(ingredients.map((i) => scaleNutrients(i.per100g, i.grams * servings)));
}

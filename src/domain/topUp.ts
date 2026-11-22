import { scaleNutrients, sumNutrients } from './nutrients';
import { normalizeSearch } from './text';
import type { Entry, GoalType, Nutrients } from './types';

/** Something the person eats often, in the portion they usually eat. */
export type Habit = {
  name: string;
  /** The usual portion (median of the logged ones). */
  grams: number;
  per100g: Nutrients;
  foodId?: string;
  uses: number;
  /** A simple product from the shop list, not something from the person's own diary. */
  store?: boolean;
};

/** What kind of food it is, for the time-of-day and "already eaten today" rules. */
export type FoodKind = 'egg' | 'curd' | 'meat' | 'sweet' | 'other';

const EGG = /яйц|омлет|яичниц/;
const CURD = /творог|творож|сырник/;
const MEAT =
  /куриц|курин|цыпл|говяд|свинин|свиной|индейк|телят|баранин|мяс|колбас|сосиск|сарделк|ветчин|бекон|фарш|котлет|бургер|шашлык|стейк|печенк|печень\b|тушенк|грудк|окорок|шницел|наггетс|пельмен|хинкал|шаурм|шаверм|салями|буженин/;
const SWEET =
  /торт|пирожн|конфет|шоколад|мороженое|пломбир|печенье|вафл|булочк|круассан|пончик|десерт|зефир|халва|варенье|коктейль/;

export function kindOf(name: string): FoodKind {
  const n = normalizeSearch(name);
  if (EGG.test(n)) return 'egg';
  if (CURD.test(n)) return 'curd';
  if (MEAT.test(n)) return 'meat';
  if (SWEET.test(n)) return 'sweet';
  return 'other';
}

/** Simple things that are easy to buy: for a diary that is still short. Per 100 g. */
const n = (kcal: number, protein: number, fat: number, carbs: number): Nutrients => ({
  kcal,
  protein,
  fat,
  carbs,
});
export const STORE_FOODS: readonly Habit[] = [
  { name: 'Кефир 1%', grams: 250, per100g: n(40, 3.4, 1, 4), uses: 0, store: true },
  { name: 'Греческий йогурт 2%', grams: 150, per100g: n(73, 9, 2, 4), uses: 0, store: true },
  { name: 'Треска запечённая', grams: 200, per100g: n(98, 21.5, 1, 0), uses: 0, store: true },
  { name: 'Минтай отварной', grams: 200, per100g: n(72, 16, 0.9, 0), uses: 0, store: true },
  { name: 'Тунец в собственном соку', grams: 120, per100g: n(96, 21, 1, 0), uses: 0, store: true },
  { name: 'Креветки варёные', grams: 150, per100g: n(95, 20, 1.8, 0), uses: 0, store: true },
  { name: 'Кальмар отварной', grams: 150, per100g: n(98, 18, 2.2, 2), uses: 0, store: true },
  { name: 'Тофу', grams: 150, per100g: n(76, 8.1, 4.8, 1.9), uses: 0, store: true },
  {
    name: 'Салат из огурцов и помидоров',
    grams: 250,
    per100g: n(17, 0.8, 0.1, 3),
    uses: 0,
    store: true,
  },
  { name: 'Яблоко', grams: 150, per100g: n(52, 0.3, 0.2, 14), uses: 0, store: true },
  { name: 'Хлебцы цельнозерновые', grams: 30, per100g: n(300, 10, 2.5, 55), uses: 0, store: true },
  { name: 'Гречка варёная', grams: 200, per100g: n(110, 4, 1, 21), uses: 0, store: true },
  { name: 'Творог 2%', grams: 180, per100g: n(103, 18, 2, 3), uses: 0, store: true },
  {
    name: 'Куриная грудка отварная',
    grams: 150,
    per100g: n(137, 29.8, 1.8, 0.5),
    uses: 0,
    store: true,
  },
  { name: 'Яйца варёные', grams: 110, per100g: n(143, 12.9, 9.9, 0.7), uses: 0, store: true },
];

/** What the moment and the day so far rule out. */
export type TopUpContext = {
  /** Local hour 0–23; from 19:00 to 5:00 it is the last meal before sleep: light food only. */
  hour?: number;
  /** Names of what was already eaten today (not suggested again; eggs/curd as a kind). */
  eatenToday?: readonly string[];
  goalType?: GoalType;
};

export const isEvening = (hour: number | undefined) =>
  hour !== undefined && (hour >= 19 || hour < 5);

/** One idea for the rest of the day: one or two habits. */
export type TopUp = { items: Habit[]; total: Nutrients };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Too little to count as food ("чай без сахара", a spoon of something). */
const MIN_KCAL = 30;

/**
 * What the person usually eats, from their own diary: each food with the portion they usually
 * take and its latest values per 100 g, most frequent first.
 */
export function habitsFrom(entries: readonly Entry[]): Habit[] {
  const by = new Map<
    string,
    { name: string; grams: number[]; per100g: Nutrients; foodId?: string; at: string }
  >();
  for (const e of entries) {
    for (const i of e.items) {
      if (!(i.grams > 0) || !(i.nutrients.kcal > 0)) continue;
      const key = i.foodId ?? normalizeSearch(i.name);
      const per100g = scaleNutrients(i.nutrients, 10000 / i.grams);
      const at = `${e.date} ${e.time}`;
      const cur = by.get(key);
      if (!cur) {
        by.set(key, {
          name: i.name,
          grams: [i.grams],
          per100g,
          ...(i.foodId ? { foodId: i.foodId } : {}),
          at,
        });
      } else {
        cur.grams.push(i.grams);
        // The latest values win (a corrected portion, a new recipe).
        if (at > cur.at) Object.assign(cur, { name: i.name, per100g, at });
      }
    }
  }
  return [...by.values()]
    .map((h) => ({
      name: h.name,
      grams: Math.round(median(h.grams)),
      per100g: h.per100g,
      ...(h.foodId ? { foodId: h.foodId } : {}),
      uses: h.grams.length,
    }))
    .filter((h) => scaleNutrients(h.per100g, h.grams).kcal >= MIN_KCAL)
    .sort((a, b) => b.uses - a.uses);
}

/**
 * Up to `n` ideas of one or two usual foods that fit what is left of the day: as close to the
 * calories left as possible without going over, with as much of the protein left as possible.
 * Each idea brings at least one food the others do not.
 */
export function topUps(
  habits: readonly Habit[],
  left: { kcal: number; protein: number; fat?: number },
  count = 3,
  ctx: TopUpContext = {},
): TopUp[] {
  if (left.kcal < 100) return [];
  const eaten = (ctx.eatenToday ?? []).map(normalizeSearch);
  const eatenKinds = new Set((ctx.eatenToday ?? []).map(kindOf));
  const evening = isEvening(ctx.hour);
  const allowed = (h: Habit) => {
    const k = kindOf(h.name);
    const name = normalizeSearch(h.name);
    if (eaten.includes(name)) return false;
    // Eggs and curd once a day: the person said "яйца уже ела сегодня".
    if ((k === 'egg' || k === 'curd') && eatenKinds.has(k)) return false;
    // Before sleep: nothing heavy (meat), and curd is a morning food.
    if (evening && (k === 'meat' || k === 'curd' || k === 'egg')) return false;
    if (evening && k === 'sweet' && ctx.goalType === 'lose') return false;
    // A one-off big portion (a litre of a milkshake) is not a habit.
    if (!h.store && h.uses < 2 && h.grams > 400) return false;
    return true;
  };
  const own = habits.filter(allowed);
  const shop = STORE_FOODS.filter(allowed);
  // Foods eaten more than once come first: a one-off (a whole carton of a milkshake) is not a
  // habit. With too few repeated foods everything in the diary is used.
  const repeated = own.filter((h) => h.uses >= 2);
  const pool = [...(repeated.length >= 6 ? repeated : own).slice(0, 30), ...shop];
  const maxUses = Math.max(1, ...pool.map((h) => h.uses));
  const options: (TopUp & { score: number })[] = [];
  const build = (fatLimit: boolean) => {
    options.length = 0;
    const consider = (items: Habit[]) => {
      const total = sumNutrients(items.map((h) => scaleNutrients(h.per100g, h.grams)));
      // Not over the calories left (a small margin), and worth eating.
      if (total.kcal > left.kcal * 1.05 + 20 || total.kcal < Math.min(150, left.kcal * 0.35))
        return;
      // The fat left for the day is a limit too ("жиров уже не надо").
      const fatLeft = left.fat === undefined ? undefined : Math.max(0, left.fat);
      if (fatLimit && fatLeft !== undefined && total.fat > fatLeft * 1.1 + 5) return;
      const fill = total.kcal / left.kcal;
      const protein = left.protein > 5 ? Math.min(total.protein, left.protein) / left.protein : 0;
      const usual = items.reduce((s, h) => s + h.uses, 0) / (items.length * maxUses);
      const lean = fatLeft === undefined ? 0 : 1 - Math.min(1, total.fat / Math.max(fatLeft, 5));
      const base =
        left.protein > 5 ? fill * 0.4 + protein * 0.3 + usual * 0.3 : fill * 0.7 + usual * 0.3;
      options.push({ items, total, score: base + lean * 0.15 });
    };
    pool.forEach((a, i) => {
      consider([a]);
      pool.slice(i + 1).forEach((b) => consider([a, b]));
    });
  };
  build(true);
  // Nothing lean enough: better something than an empty card.
  if (options.length === 0) build(false);
  options.sort((a, b) => b.score - a.score);
  const picked: TopUp[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    if (picked.length >= count) break;
    const names = o.items.map((h) => h.name);
    if (names.every((x) => seen.has(x))) continue;
    names.forEach((x) => seen.add(x));
    picked.push({ items: o.items, total: o.total });
  }
  return picked;
}

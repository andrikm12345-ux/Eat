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
  /** Minutes to get it ready to eat (0 = eat as it is). Only known for the shop list. */
  minutes?: number;
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
  { name: 'Кефир 1%', grams: 250, per100g: n(40, 3.4, 1, 4), uses: 0, store: true, minutes: 0 },
  {
    name: 'Греческий йогурт 2%',
    grams: 150,
    per100g: n(73, 9, 2, 4),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Скир (высокобелковый йогурт)',
    grams: 150,
    per100g: n(63, 11, 0.2, 4),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Тунец в собственном соку',
    grams: 120,
    per100g: n(96, 21, 1, 0),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Крабовые палочки',
    grams: 120,
    per100g: n(95, 6, 1, 15),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Креветки варёные',
    grams: 150,
    per100g: n(95, 20, 1.8, 0),
    uses: 0,
    store: true,
    minutes: 3,
  },
  {
    name: 'Кальмар отварной',
    grams: 150,
    per100g: n(98, 18, 2.2, 2),
    uses: 0,
    store: true,
    minutes: 5,
  },
  { name: 'Тофу', grams: 150, per100g: n(76, 8.1, 4.8, 1.9), uses: 0, store: true, minutes: 3 },
  {
    name: 'Салат из огурцов и помидоров',
    grams: 250,
    per100g: n(17, 0.8, 0.1, 3),
    uses: 0,
    store: true,
    minutes: 5,
  },
  {
    name: 'Огурцы свежие',
    grams: 200,
    per100g: n(15, 0.8, 0.1, 3),
    uses: 0,
    store: true,
    minutes: 0,
  },
  { name: 'Яблоко', grams: 150, per100g: n(52, 0.3, 0.2, 14), uses: 0, store: true, minutes: 0 },
  {
    name: 'Хлебцы цельнозерновые',
    grams: 30,
    per100g: n(300, 10, 2.5, 55),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Гречка варёная',
    grams: 200,
    per100g: n(110, 4, 1, 21),
    uses: 0,
    store: true,
    minutes: 15,
  },
  {
    name: 'Минтай отварной',
    grams: 200,
    per100g: n(72, 16, 0.9, 0),
    uses: 0,
    store: true,
    minutes: 20,
  },
  {
    name: 'Треска запечённая',
    grams: 200,
    per100g: n(98, 21.5, 1, 0),
    uses: 0,
    store: true,
    minutes: 25,
  },
  { name: 'Творог 2%', grams: 180, per100g: n(103, 18, 2, 3), uses: 0, store: true, minutes: 0 },
  {
    name: 'Куриная грудка отварная',
    grams: 150,
    per100g: n(137, 29.8, 1.8, 0.5),
    uses: 0,
    store: true,
    minutes: 20,
  },
  {
    name: 'Яйца варёные',
    grams: 110,
    per100g: n(143, 12.9, 9.9, 0.7),
    uses: 0,
    store: true,
    minutes: 12,
  },
  { name: 'Банан', grams: 120, per100g: n(89, 1.1, 0.3, 23), uses: 0, store: true, minutes: 0 },
  { name: 'Миндаль', grams: 30, per100g: n(579, 21, 50, 22), uses: 0, store: true, minutes: 0 },
  {
    name: 'Арахисовая паста',
    grams: 30,
    per100g: n(588, 25, 50, 20),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Лосось слабосолёный',
    grams: 100,
    per100g: n(202, 22, 12, 0),
    uses: 0,
    store: true,
    minutes: 0,
  },
  { name: 'Кефир 3,2%', grams: 250, per100g: n(59, 2.9, 3.2, 4), uses: 0, store: true, minutes: 0 },
  {
    name: 'Греческий йогурт 5%',
    grams: 150,
    per100g: n(97, 9, 5, 4),
    uses: 0,
    store: true,
    minutes: 0,
  },
  {
    name: 'Хлеб цельнозерновой',
    grams: 60,
    per100g: n(250, 9, 3, 45),
    uses: 0,
    store: true,
    minutes: 0,
  },
  { name: 'Гранола', grams: 50, per100g: n(450, 10, 18, 60), uses: 0, store: true, minutes: 0 },
  { name: 'Курага', grams: 40, per100g: n(240, 3.4, 0.5, 55), uses: 0, store: true, minutes: 0 },
  { name: 'Авокадо', grams: 100, per100g: n(160, 2, 15, 9), uses: 0, store: true, minutes: 0 },
  { name: 'Творог 9%', grams: 180, per100g: n(159, 16, 9, 3), uses: 0, store: true, minutes: 0 },
];

/** What the moment and the day so far rule out. */
export type TopUpContext = {
  /** Local hour 0–23; from 19:00 to 5:00 it is the last meal before sleep: light food only. */
  hour?: number;
  /** Names of what was already eaten today (not suggested again; eggs/curd as a kind). */
  eatenToday?: readonly string[];
  goalType?: GoalType;
  /** Only the shop list ("what to buy"), not the person's own foods. */
  storeOnly?: boolean;
  /** At most this many minutes of getting the food ready, all items together. */
  maxMinutes?: number | null;
};

export const isEvening = (hour: number | undefined) =>
  hour !== undefined && (hour >= 19 || hour < 5);

/** One idea for the rest of the day: one or two habits. */
export type TopUp = { items: Habit[]; total: Nutrients; minutes: number };

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
  const own = ctx.storeOnly ? [] : habits.filter(allowed);
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
      const minutes = items.reduce((m, h) => m + (h.minutes ?? 0), 0);
      if (ctx.maxMinutes != null && minutes > ctx.maxMinutes) return;
      const total = sumNutrients(items.map((h) => scaleNutrients(h.per100g, h.grams)));
      // Not over the calories left (a small margin), and worth eating.
      if (total.kcal > left.kcal * 1.05 + 20 || total.kcal < Math.min(150, left.kcal * 0.35))
        return;
      const gain = ctx.goalType === 'gain';
      // Far more protein than is needed is not a plan either.
      if (left.protein > 5 && total.protein > left.protein * 1.6 + 10) return;
      // Gaining: worth eating only if it brings a good part of what is still to eat.
      if (gain && left.kcal >= 400 && total.kcal < left.kcal * 0.45) return;
      // The fat left for the day is a limit too ("жиров уже не надо"), softer when gaining.
      const fatLeft = left.fat === undefined ? undefined : Math.max(0, left.fat);
      const fatSlack = fatLeft === undefined ? 0 : fatLeft * (gain ? 0.15 : 0.1) + 5;
      if (fatLimit && fatLeft !== undefined && total.fat > fatLeft + fatSlack) return;
      const fill = total.kcal / left.kcal;
      const protein = left.protein > 5 ? Math.min(total.protein, left.protein) / left.protein : 0;
      const usual = items.reduce((s, h) => s + h.uses, 0) / (items.length * maxUses);
      const lean = fatLeft === undefined ? 0 : 1 - Math.min(1, total.fat / Math.max(fatLeft, 5));
      // Losing: lean food first. Keeping: a little. Gaining: calories and protein first, and
      // the fat left to use is welcome, not to be avoided.
      const leanWeight = ctx.goalType === 'lose' ? 0.15 : ctx.goalType === 'gain' ? 0 : 0.05;
      const useFat =
        gain && fatLeft !== undefined && fatLeft > 10 ? Math.min(1, total.fat / fatLeft) * 0.1 : 0;
      const base = gain
        ? left.protein > 5
          ? fill * 0.5 + protein * 0.25 + usual * 0.25
          : fill * 0.75 + usual * 0.25
        : left.protein > 5
          ? fill * 0.4 + protein * 0.3 + usual * 0.3
          : fill * 0.7 + usual * 0.3;
      options.push({ items, total, minutes, score: base + lean * leanWeight + useFat });
    };
    // Gaining: the usual portion may be a bit bigger (one and a half, two) to eat what is left.
    const scales = ctx.goalType === 'gain' ? [1, 1.5, 2] : [1];
    const scaled = (items: Habit[]) =>
      scales.forEach((k) =>
        consider(
          k === 1 ? items : items.map((h) => ({ ...h, grams: Math.round((h.grams * k) / 5) * 5 })),
        ),
      );
    pool.forEach((a, i) => {
      scaled([a]);
      pool.slice(i + 1).forEach((b, j) => {
        scaled([a, b]);
        // A meal of three: when gaining there is a lot to eat.
        if (ctx.goalType === 'gain') pool.slice(i + 2 + j).forEach((c) => scaled([a, b, c]));
      });
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
    picked.push({ items: o.items, total: o.total, minutes: o.minutes });
  }
  return picked;
}

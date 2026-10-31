import { toLocalDate, toLocalTime } from '../domain/dates';
import { scaleNutrients, sumNutrients } from '../domain/nutrients';
import type {
  Entry,
  EntryItem,
  EntrySource,
  Food,
  LocalDate,
  LocalTime,
  Nutrients,
} from '../domain/types';
import type { Repos } from '../db/repos';

/** Item snapshot for `grams` of a food. */
export function itemFromFood(
  food: Pick<Food, 'id' | 'name' | 'per100g'>,
  grams: number,
): EntryItem {
  return {
    foodId: food.id,
    name: food.name,
    grams,
    nutrients: scaleNutrients(food.per100g, grams),
  };
}

/** Logs `grams` of a food and updates its usage stats. */
export async function logFood(
  r: Repos,
  food: Food,
  grams: number,
  at: { date: LocalDate; time: LocalTime },
  source: EntrySource = 'manual',
): Promise<Entry> {
  return r.db.transaction('rw', r.db.entries, r.db.foods, async () => {
    const e = await r.entries.add({ ...at, items: [itemFromFood(food, grams)], source });
    await r.foods.markUsed(food.id, grams);
    return e;
  });
}

export async function logQuick(
  r: Repos,
  data: { name: string; nutrients: Nutrients },
  at: { date: LocalDate; time: LocalTime },
): Promise<Entry> {
  return r.entries.add({
    ...at,
    items: [{ name: data.name, grams: 0, nutrients: data.nutrients }],
    source: 'quick',
  });
}

/** Copies an entry to another day/time (snapshot is kept). */
export async function copyEntry(
  r: Repos,
  e: Entry,
  at: { date: LocalDate; time: LocalTime },
  source: EntrySource = 'repeat',
): Promise<Entry> {
  return r.entries.add({
    date: at.date,
    time: at.time,
    items: e.items.map((i) => ({ ...i, nutrients: { ...i.nutrients } })),
    source,
    ...(e.mealLabel ? { mealLabel: e.mealLabel } : {}),
    ...(e.note ? { note: e.note } : {}),
  });
}

/** Repeats an entry today at the current time. */
export function repeatNow(r: Repos, e: Entry, now = new Date()) {
  return copyEntry(r, e, { date: toLocalDate(now), time: toLocalTime(now) });
}

/** Copies all entries of `from` to `to`, keeping their times. */
export async function copyDay(r: Repos, from: LocalDate, to: LocalDate): Promise<Entry[]> {
  const list = await r.entries.byDate(from);
  return r.db.transaction('rw', r.db.entries, async () => {
    const out: Entry[] = [];
    for (const e of list) out.push(await copyEntry(r, e, { date: to, time: e.time }));
    return out;
  });
}

/** Saves an entry's items as a template. */
export async function saveAsTemplate(r: Repos, e: Entry, name: string) {
  return r.templates.create({
    name,
    items: e.items.map((i) => ({
      ...(i.foodId ? { foodId: i.foodId } : {}),
      ...(i.recipeId ? { recipeId: i.recipeId } : {}),
      name: i.name,
      grams: i.grams,
      snapshot: { ...i.nutrients },
    })),
  });
}

/**
 * "Пересчитать по текущим данным продукта": refreshes item snapshots from foods
 * that still exist. Returns the number of updated items.
 */
export async function recalcFromFoods(r: Repos, e: Entry): Promise<number> {
  let n = 0;
  const items: EntryItem[] = [];
  for (const i of e.items) {
    const f = i.foodId ? await r.foods.get(i.foodId) : undefined;
    if (f) {
      items.push({ ...i, nutrients: scaleNutrients(f.per100g, i.grams) });
      n++;
    } else items.push(i);
  }
  if (n) await r.entries.edit(e.id, { items });
  return n;
}

export function entriesTotals(list: readonly Entry[]): Nutrients {
  return sumNutrients(list.map((e) => e.totals));
}

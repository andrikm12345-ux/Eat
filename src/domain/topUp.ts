import { scaleNutrients, sumNutrients } from './nutrients';
import { normalizeSearch } from './text';
import type { Entry, Nutrients } from './types';

/** Something the person eats often, in the portion they usually eat. */
export type Habit = {
  name: string;
  /** The usual portion (median of the logged ones). */
  grams: number;
  per100g: Nutrients;
  foodId?: string;
  uses: number;
};

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
  left: { kcal: number; protein: number },
  n = 3,
): TopUp[] {
  if (left.kcal < 100) return [];
  const pool = habits.slice(0, 24);
  const maxUses = Math.max(1, ...pool.map((h) => h.uses));
  const options: (TopUp & { score: number })[] = [];
  const consider = (items: Habit[]) => {
    const total = sumNutrients(items.map((h) => scaleNutrients(h.per100g, h.grams)));
    // Not over the calories left (a small margin), and worth eating.
    if (total.kcal > left.kcal * 1.05 + 20 || total.kcal < Math.min(150, left.kcal * 0.35)) return;
    const fill = total.kcal / left.kcal;
    const protein = left.protein > 5 ? Math.min(total.protein, left.protein) / left.protein : 0;
    const usual = items.reduce((s, h) => s + h.uses, 0) / (items.length * maxUses);
    const score =
      left.protein > 5 ? fill * 0.5 + protein * 0.4 + usual * 0.1 : fill * 0.85 + usual * 0.15;
    options.push({ items, total, score });
  };
  pool.forEach((a, i) => {
    consider([a]);
    pool.slice(i + 1).forEach((b) => consider([a, b]));
  });
  options.sort((a, b) => b.score - a.score);
  const picked: TopUp[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    if (picked.length >= n) break;
    const names = o.items.map((h) => h.name);
    if (names.every((x) => seen.has(x))) continue;
    names.forEach((x) => seen.add(x));
    picked.push({ items: o.items, total: o.total });
  }
  return picked;
}

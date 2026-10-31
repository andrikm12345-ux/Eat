import type { Entry, EntryItem, LocalTime, Nutrients } from './types';
import { scaleNutrients, sumNutrients } from './nutrients';

/** Minutes since midnight for `HH:mm`. */
export function timeToMinutes(t: LocalTime): number {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function minutesToTime(min: number): LocalTime {
  const v = Math.min(24 * 60 - 1, Math.max(0, Math.round(min)));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export const STACK_GAP_MIN = 30;

/**
 * Groups entries (any order) into stacks: an entry joins the current stack when it is
 * no more than 30 minutes after the previous entry.
 */
export function groupStacks<E extends Pick<Entry, 'time'>>(
  entries: readonly E[],
  gapMin = STACK_GAP_MIN,
): E[][] {
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  const stacks: E[][] = [];
  let prev: number | null = null;
  for (const e of sorted) {
    const m = timeToMinutes(e.time);
    const last = stacks[stacks.length - 1];
    if (last && prev !== null && m - prev <= gapMin) last.push(e);
    else stacks.push([e]);
    prev = m;
  }
  return stacks;
}

/** Display title of an entry: meal label or item names. */
export function entryTitle(e: Pick<Entry, 'mealLabel' | 'items'>, maxLen = 60): string {
  if (e.mealLabel) return e.mealLabel;
  const s = e.items.map((i) => i.name).join(', ');
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

/** Item with new grams; nutrients scale proportionally from the snapshot. */
export function rescaleItem(item: EntryItem, grams: number): EntryItem {
  if (item.grams <= 0) return { ...item, grams };
  const per100 = scaleNutrients(item.nutrients, (100 / item.grams) * 100);
  return { ...item, grams, nutrients: scaleNutrients(per100, grams) };
}

export function dayTotals(entries: readonly Pick<Entry, 'totals'>[]): Nutrients {
  return sumNutrients(entries.map((e) => e.totals));
}

export type DayStatus = 'empty' | 'below' | 'close' | 'above';
/** Neutral status relative to that day's goal: within ±10 % is "close". */
export function dayStatus(kcal: number, goalKcal: number | undefined): DayStatus {
  if (!(kcal > 0)) return 'empty';
  if (!goalKcal) return 'close';
  const r = kcal / goalKcal;
  if (r < 0.9) return 'below';
  if (r > 1.1) return 'above';
  return 'close';
}

/**
 * Food ids most often eaten around this time of day (± window), most frequent first;
 * ties broken by overall frequency.
 */
export function frequentAround(
  entries: readonly Pick<Entry, 'time' | 'items'>[],
  nowMin: number,
  opts: { windowMin?: number; limit?: number } = {},
): string[] {
  const windowMin = opts.windowMin ?? 120;
  const near = new Map<string, number>();
  const all = new Map<string, number>();
  for (const e of entries) {
    const d = Math.abs(timeToMinutes(e.time) - nowMin);
    const circular = Math.min(d, 24 * 60 - d);
    for (const it of e.items) {
      if (!it.foodId) continue;
      all.set(it.foodId, (all.get(it.foodId) ?? 0) + 1);
      if (circular <= windowMin) near.set(it.foodId, (near.get(it.foodId) ?? 0) + 1);
    }
  }
  return [...near.keys()]
    .sort(
      (a, b) =>
        (near.get(b) as number) - (near.get(a) as number) ||
        (all.get(b) as number) - (all.get(a) as number),
    )
    .slice(0, opts.limit ?? 8);
}

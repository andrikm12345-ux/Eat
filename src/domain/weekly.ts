import { sumNutrients } from './nutrients';
import { goalFor } from './goals';
import type { Entry, Goal, LocalDate, Nutrients } from './types';

export type SourceRow = { name: string; value: number; share: number };

/** Top sources of a nutrient aggregated by item name. */
export function topSources(
  entries: readonly Pick<Entry, 'items'>[],
  key: 'kcal' | 'protein',
  n = 5,
): SourceRow[] {
  const by = new Map<string, number>();
  let total = 0;
  for (const e of entries)
    for (const i of e.items) {
      const v = i.nutrients[key];
      by.set(i.name, (by.get(i.name) ?? 0) + v);
      total += v;
    }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, n)
    .map(([name, value]) => ({ name, value, share: total > 0 ? value / total : 0 }));
}

export type WeekSummary = {
  days: LocalDate[];
  loggedDays: number;
  /** Averages over logged days. */
  avg: Nutrients;
  /** Average of each day's goal over the week (days with a goal). */
  goalAvg: { kcal: number; protein: number; fat: number; carbs: number; fiber: number } | null;
};

export function summarizeWeek(
  days: readonly LocalDate[],
  entries: readonly Entry[],
  goals: readonly Goal[],
): WeekSummary {
  const byDay = new Map<LocalDate, Entry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const logged = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0);
  const total = sumNutrients(logged.flatMap((d) => (byDay.get(d) as Entry[]).map((e) => e.totals)));
  const avg: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  if (logged.length)
    for (const [k, v] of Object.entries(total)) avg[k] = (v as number) / logged.length;
  const dayGoals = days.map((d) => goalFor(goals, d)).filter((g): g is Goal => !!g);
  const goalAvg = dayGoals.length
    ? {
        kcal: dayGoals.reduce((s, g) => s + g.kcal, 0) / dayGoals.length,
        protein: dayGoals.reduce((s, g) => s + g.protein, 0) / dayGoals.length,
        fat: dayGoals.reduce((s, g) => s + g.fat, 0) / dayGoals.length,
        carbs: dayGoals.reduce((s, g) => s + g.carbs, 0) / dayGoals.length,
        fiber: dayGoals.reduce((s, g) => s + (g.fiber ?? 0), 0) / dayGoals.length,
      }
    : null;
  return { days: [...days], loggedDays: logged.length, avg, goalAvg };
}

import { useLiveQuery } from 'dexie-react-hooks';
import { goalFor } from '../../domain/goals';
import { weekDays } from '../../domain/dates';
import type { LocalDate } from '../../domain/types';
import { repos } from '../../db/repos';

/** Entries, goal and meta of one day. */
export function useDay(date: LocalDate) {
  return useLiveQuery(async () => {
    const [entries, goal, meta] = await Promise.all([
      repos.entries.byDate(date),
      repos.goals.goalFor(date),
      repos.dayMeta.get(date),
    ]);
    return { entries, goal: goal ?? null, meta };
  }, [date]);
}

/** kcal eaten vs that day's goal for each day of the week. */
export function useWeek(date: LocalDate) {
  const days = weekDays(date);
  return useLiveQuery(async () => {
    const [entries, goals] = await Promise.all([
      repos.entries.inRange(days[0] as string, days[6] as string),
      repos.goals.list(),
    ]);
    return days.map((d) => ({
      date: d,
      kcal: entries.filter((e) => e.date === d).reduce((s, e) => s + e.totals.kcal, 0),
      goal: goalFor(goals, d)?.kcal,
    }));
  }, [days[0]]);
}

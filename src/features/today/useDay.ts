import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDate } from '../../domain/types';
import { repos } from '../../db/repos';

/** Entries, goal and meta of one day. */
export function useDay(date: LocalDate) {
  return useLiveQuery(async () => {
    const [entries, goal, meta, workouts, profile] = await Promise.all([
      repos.entries.byDate(date),
      repos.goals.goalFor(date),
      repos.dayMeta.get(date),
      repos.workouts.where('date', date),
      repos.profile.get(),
    ]);
    return {
      entries,
      goal: goal ?? null,
      meta,
      workouts: workouts.sort((a, b) => a.time.localeCompare(b.time)),
      mode: profile?.exerciseCaloriesMode ?? 'none',
    };
  }, [date]);
}

import { useLiveQuery } from 'dexie-react-hooks';
import type { Goal, LocalDate, Profile } from '../domain/types';
import { repos } from './repos';

/** `undefined` while loading, `null` when absent. */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => (await repos.profile.get()) ?? null, []);
}

export function useGoalFor(date: LocalDate): Goal | null | undefined {
  return useLiveQuery(async () => (await repos.goals.goalFor(date)) ?? null, [date]);
}

export function useGoals(): Goal[] | undefined {
  return useLiveQuery(
    async () => (await repos.goals.list()).sort((a, b) => b.validFrom.localeCompare(a.validFrom)),
    [],
  );
}

export function useLatestWeight() {
  return useLiveQuery(async () => (await repos.weights.latest()) ?? null, []);
}

export function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(() => repos.settings.get<T>(key, fallback), [key]);
}

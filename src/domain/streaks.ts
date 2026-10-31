import { addDays } from './dates';
import type { LocalDate } from './types';

export const FREEZES_PER_MONTH = 2;

export type Streak = {
  /** Consecutive counted days up to today (today counts only if done). */
  current: number;
  best: number;
  /** Freezes used in the current calendar month. */
  freezesUsed: number;
};

/**
 * Daily streak: a day counts when `done` has it. A missed day is bridged by a freeze
 * (at most `freezes` per calendar month); otherwise the streak restarts. Today not being
 * done yet does not break the streak.
 */
export function computeStreak(
  done: ReadonlySet<LocalDate>,
  today: LocalDate,
  freezes = FREEZES_PER_MONTH,
): Streak {
  const dates = [...done].filter((d) => d <= today).sort();
  if (!dates.length) return { current: 0, best: 0, freezesUsed: 0 };
  const used = new Map<string, number>();
  let run = 0;
  let best = 0;
  for (let d = dates[0] as LocalDate; d <= today; d = addDays(d, 1)) {
    if (done.has(d)) {
      run++;
      best = Math.max(best, run);
      continue;
    }
    if (d === today) break;
    const month = d.slice(0, 7);
    const n = used.get(month) ?? 0;
    if (n < freezes) {
      used.set(month, n + 1);
    } else {
      run = 0;
    }
  }
  return { current: run, best, freezesUsed: used.get(today.slice(0, 7)) ?? 0 };
}

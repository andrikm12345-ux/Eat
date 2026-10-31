import { liveQuery } from 'dexie';
import { toLocalDate } from '../domain/dates';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ensureCheckin, recomputeTdee } from './tdee';

/**
 * Keeps tdeeHistory up to date: recomputes on start and (debounced) whenever entries,
 * weights, day metadata, goals, profile or TDEE settings change; then creates the weekly
 * check-in if due. Returns an unsubscribe function.
 */
export function startTdeeSync(r: Repos, delayMs = 600): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const today = toLocalDate(new Date());
      const state = await recomputeTdee(r, today);
      if (!stopped) await ensureCheckin(r, today, state);
    } catch (e) {
      console.error('TDEE recompute failed', e);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };

  const keys = [
    SETTINGS.trendAlpha.key,
    SETTINGS.weightDailyPick.key,
    SETTINGS.tdeeWindowDays.key,
    SETTINGS.tdeeRho.key,
    SETTINGS.checkinWeekday.key,
  ];
  const sub = liveQuery(() =>
    Promise.all([
      r.db.entries.count(),
      r.db.weights.count(),
      r.db.dayMeta.count(),
      r.db.goals.count(),
      r.db.profile.count(),
      r.db.settings.where('key').anyOf(keys).toArray(),
    ]),
  ).subscribe({
    next: () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delayMs);
    },
    error: (e) => console.error(e),
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
    sub.unsubscribe();
  };
}

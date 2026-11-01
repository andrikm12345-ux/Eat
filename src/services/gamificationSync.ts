import { liveQuery } from 'dexie';
import { toLocalDate } from '../domain/dates';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';
import { useCelebrate } from '../state/celebrate';
import { applyBadge, badgeValue, evaluateAchievements } from './gamification';

/** Re-evaluates achievements and the icon badge after data changes (debounced). */
export function startGamificationSync(r: Repos, delayMs = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      const today = toLocalDate(new Date());
      const unlocks = await evaluateAchievements(r, today);
      await applyBadge(await badgeValue(r, today));
      if (stopped || unlocks.length === 0) return;
      const [confetti, vibrate] = await Promise.all([
        r.settings.get(SETTINGS.confetti.key, SETTINGS.confetti.def),
        r.settings.get(SETTINGS.vibrate.key, SETTINGS.vibrate.def),
      ]);
      for (const u of unlocks) {
        useCelebrate
          .getState()
          .showCard(
            u.level !== undefined && u.def.id === 'path'
              ? ru.achievements.level(u.def.title, String(u.level * 2.5).replace('.', ','))
              : u.def.title,
          );
      }
      if (confetti) useCelebrate.getState().fire();
      if (vibrate) navigator.vibrate?.([30, 40, 30]);
    } catch (e) {
      console.error('Achievements failed', e);
    }
  };
  const sub = liveQuery(() =>
    Promise.all([
      r.db.entries.count(),
      r.db.weights.count(),
      r.db.foods.count(),
      r.db.recipes.count(),
      r.db.templates.count(),
      r.db.measurements.count(),
      r.db.workouts.count(),
      r.db.dayMeta.count(),
      r.db.blobs.count(),
      r.db.checkins.count(),
      r.db.goals.count(),
      r.db.settings.count(),
    ]),
  ).subscribe({
    next: () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delayMs);
    },
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
    sub.unsubscribe();
  };
}

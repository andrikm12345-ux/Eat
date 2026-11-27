import type { Repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { toast } from '../state/ui';
import { fixOverstatedProtein } from './goalFix';

/** Runs the goal correction and tells the person once what changed. */
export async function announceGoalFix(r: Repos): Promise<void> {
  const fixed = await fixOverstatedProtein(r);
  const first = fixed[0];
  if (!first) return;
  const text = first.recalculated
    ? ru.goalFix.recalculated(first.wasKcal, first.nowKcal, first.was, first.now)
    : ru.goalFix.toast(first.was, first.now);
  toast({ text, durationMs: 20000 });
}

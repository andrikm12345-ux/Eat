import type { Repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { toast } from '../state/ui';
import { fixOverstatedProtein } from './goalFix';

/** Runs the protein correction and tells the person once what changed. */
export async function announceGoalFix(r: Repos): Promise<void> {
  const fixed = await fixOverstatedProtein(r);
  const first = fixed[0];
  if (first) toast({ text: ru.goalFix.toast(first.was, first.now), durationMs: 15000 });
}

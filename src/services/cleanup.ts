import { MEALS } from '../domain/meals';
import type { Repos } from '../db/repos';

/**
 * Entries made by the AI used to get a meal name from the AI's guess ("Завтрак" for a 21:15
 * khachapuri), and the day line trusts that name over the time. This clears such names from AI
 * entries nobody has touched since (the entry was never edited, so the name is the AI's).
 * Safe to run on every start: a cleared entry no longer matches, an edited one is skipped.
 */
export async function clearAiMealLabels(r: Repos): Promise<number> {
  const names = MEALS as readonly string[];
  const entries = await r.entries.list();
  let n = 0;
  for (const e of entries) {
    if (e.source !== 'ai_text' && e.source !== 'ai_photo') continue;
    if (!e.mealLabel || !names.includes(e.mealLabel)) continue;
    if (e.updatedAt !== e.createdAt) continue;
    await r.entries.edit(e.id, { mealLabel: undefined });
    n++;
  }
  return n;
}

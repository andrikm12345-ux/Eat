import { BASE_FOODS_SETTING } from '../db/baseFoods';
import type { Repos } from '../db/repos';

/** Settings that belong to the sign-in and the AI, not to the data: they survive a clean start. */
const keepSetting = (key: string) =>
  key === BASE_FOODS_SETTING || key.startsWith('account') || key.startsWith('ai');

/**
 * A clean start in this browser: everything the user entered is deleted (profile, goals,
 * entries, weight, own foods, recipes, templates, photos…). The bundled food catalog, the
 * sign-in and the AI settings stay. Nothing is touched in the cloud.
 */
export async function clearLocalData(r: Repos): Promise<void> {
  const d = r.db;
  await d.transaction('rw', d.tables, async () => {
    for (const t of [
      d.profile,
      d.goals,
      d.recipes,
      d.templates,
      d.entries,
      d.dayMeta,
      d.weights,
      d.measurements,
      d.workouts,
      d.tdeeHistory,
      d.checkins,
      d.achievements,
      d.aiRuns,
      d.blobs,
    ])
      await t.clear();
    await d.foods.filter((f) => f.source !== 'base').delete();
    await d.settings.filter((s) => !keepSetting(s.key)).delete();
  });
}

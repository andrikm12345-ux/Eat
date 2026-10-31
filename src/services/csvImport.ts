import type { ImportedRow } from '../domain/csv';
import type { Repos } from '../db/repos';

/**
 * Writes imported rows: weights (skipping exact duplicates), steps / active kcal into the
 * day metadata (overwriting), workouts (skipping duplicates by date+type+duration).
 */
export async function importRows(r: Repos, rows: readonly ImportedRow[]) {
  let weights = 0;
  let days = 0;
  let workouts = 0;
  await r.db.transaction('rw', [r.db.weights, r.db.dayMeta, r.db.workouts], async () => {
    const existingW = new Set((await r.weights.list()).map((w) => `${w.date}|${w.kg}`));
    const existingT = new Set(
      (await r.workouts.list()).map((w) => `${w.date}|${w.type}|${w.durationMin}`),
    );
    for (const row of rows) {
      if (row.weight !== undefined && !existingW.has(`${row.date}|${row.weight}`)) {
        await r.weights.create({ date: row.date, time: '07:00', kg: row.weight, source: 'import' });
        existingW.add(`${row.date}|${row.weight}`);
        weights++;
      }
      if (row.steps !== undefined || row.activeKcal !== undefined) {
        await r.dayMeta.upsert(row.date, {
          ...(row.steps !== undefined ? { steps: row.steps } : {}),
          ...(row.activeKcal !== undefined ? { activeKcal: row.activeKcal } : {}),
        });
        days++;
      }
      if (row.workout) {
        const key = `${row.date}|${row.workout.type}|${row.workout.durationMin}`;
        if (!existingT.has(key)) {
          await r.workouts.create({
            date: row.date,
            time: '12:00',
            ...row.workout,
            source: 'import',
          });
          existingT.add(key);
          workouts++;
        }
      }
    }
  });
  return { weights, days, workouts };
}

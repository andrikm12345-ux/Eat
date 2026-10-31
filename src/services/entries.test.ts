import { describe, expect, it } from 'vitest';
import { ensureBaseFoods, BASE_FOODS_SETTING } from '../db/baseFoods';
import { repos } from '../db/repos';
import { copyDay, logFood, logQuick, recalcFromFoods, repeatNow, saveAsTemplate } from './entries';

const per100g = { kcal: 350, protein: 12, fat: 6, carbs: 60 };

async function food() {
  return repos.foods.add({
    name: 'Овсянка',
    per100g,
    servings: [],
    source: 'user',
    verified: true,
  });
}

describe('entry services', () => {
  it('logs a food with snapshot and usage stats', async () => {
    const f = await food();
    const e = await logFood(repos, f, 60, { date: '2026-03-01', time: '08:00' });
    expect(e.totals.kcal).toBeCloseTo(210);
    expect(e.items[0]).toMatchObject({ foodId: f.id, grams: 60, name: 'Овсянка' });
    expect(await repos.foods.get(f.id)).toMatchObject({ useCount: 1, lastGrams: 60 });
  });

  it('quick kcal, repeat now, copy day', async () => {
    await logQuick(
      repos,
      { name: 'Кафе', nutrients: { kcal: 500, protein: 0, fat: 0, carbs: 0 } },
      { date: '2026-03-01', time: '13:00' },
    );
    const f = await food();
    const e = await logFood(repos, f, 100, { date: '2026-03-01', time: '08:00' });
    const r = await repeatNow(repos, e, new Date(2026, 2, 5, 9, 15));
    expect(r).toMatchObject({ date: '2026-03-05', time: '09:15', source: 'repeat' });
    const copied = await copyDay(repos, '2026-03-01', '2026-03-02');
    expect(copied.map((c) => c.time).sort()).toEqual(['08:00', '13:00']);
    expect((await repos.entries.byDate('2026-03-02')).reduce((s, x) => s + x.totals.kcal, 0)).toBe(
      850,
    );
  });

  it('saves a template and recalculates from current food data', async () => {
    const f = await food();
    const e = await logFood(repos, f, 100, { date: '2026-03-01', time: '08:00' });
    const tpl = await saveAsTemplate(repos, e, 'Завтрак');
    expect(tpl.items[0]).toMatchObject({
      foodId: f.id,
      name: 'Овсянка',
      grams: 100,
      snapshot: { kcal: 350 },
    });
    await repos.foods.edit(f.id, { per100g: { ...per100g, kcal: 400 } });
    expect((await repos.entries.get(e.id))?.totals.kcal).toBe(350);
    expect(await recalcFromFoods(repos, e)).toBe(1);
    expect((await repos.entries.get(e.id))?.totals.kcal).toBe(400);
    const q = await logQuick(
      repos,
      { name: 'x', nutrients: { kcal: 1, protein: 0, fat: 0, carbs: 0 } },
      { date: '2026-03-01', time: '09:00' },
    );
    expect(await recalcFromFoods(repos, q)).toBe(0);
  });
});

describe('base foods', () => {
  const file =
    (version: number, kcal = 89) =>
    async () => ({
      version,
      foods: [
        {
          id: 'base-1',
          name: 'Банан',
          per100g: { kcal, protein: 1, fat: 0, carbs: 23 },
          servings: [{ label: 'шт', grams: 118 }],
        },
      ],
    });

  it('loads once per version and keeps usage stats', async () => {
    expect(await ensureBaseFoods(repos, file(1))).toBe(true);
    expect(await ensureBaseFoods(repos, file(1))).toBe(false);
    const f = await repos.foods.get('base-1');
    expect(f).toMatchObject({ source: 'base', verified: true, searchKey: 'банан', useCount: 0 });
    await repos.foods.markUsed('base-1', 118);
    expect(await ensureBaseFoods(repos, file(2, 90))).toBe(true);
    expect(await repos.foods.get('base-1')).toMatchObject({
      useCount: 1,
      lastGrams: 118,
      per100g: { kcal: 90 },
    });
    expect(await repos.settings.get(BASE_FOODS_SETTING, 0)).toBe(2);
  });

  it('bundled catalog is valid', async () => {
    const data = (await import('../data/baseFoods.json')).default;
    expect(data.foods.length).toBeGreaterThan(400);
    for (const f of data.foods) {
      expect(f.name).toBeTruthy();
      expect(f.per100g.kcal).toBeGreaterThanOrEqual(0);
      expect(f.per100g.kcal).toBeLessThanOrEqual(902);
    }
    expect(new Set(data.foods.map((f) => f.id)).size).toBe(data.foods.length);
  });
});

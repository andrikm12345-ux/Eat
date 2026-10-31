import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scaleNutrients } from '../domain/nutrients';
import type { Food } from '../domain/types';
import { AppDB, SCHEMA_V1, SCHEMA_VERSION } from './db';
import { clock, newId } from './ids';
import { foodSearchKey, makeRepos, type Repos } from './repos';

let n = 0;
let db: AppDB;
let r: Repos;
let tick = 0;

beforeEach(async () => {
  db = new AppDB(`test-${++n}`);
  await db.open();
  r = makeRepos(db);
  tick = 0;
  vi.spyOn(clock, 'now').mockImplementation(() =>
    new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

const per100 = { kcal: 350, protein: 12, fat: 6, carbs: 60, fiber: 10 };

describe('schema', () => {
  it('opens version 1 with all tables', () => {
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(SCHEMA_V1).sort());
  });
});

describe('ids', () => {
  it('ULIDs are unique and sortable', () => {
    const ids = Array.from({ length: 1000 }, newId);
    expect(new Set(ids).size).toBe(1000);
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe('generic repo', () => {
  it('creates with id and timestamps, updates, soft-deletes and restores', async () => {
    const w = await r.weights.create({
      date: '2026-01-01',
      time: '07:00',
      kg: 80,
      source: 'manual',
    });
    expect(w.id).toHaveLength(26);
    expect(w.createdAt).toBe(w.updatedAt);

    const u = await r.weights.update(w.id, { kg: 79.5 });
    expect(u.kg).toBe(79.5);
    expect(u.createdAt).toBe(w.createdAt);
    expect(u.updatedAt > w.updatedAt).toBe(true);

    await r.weights.softDelete(w.id);
    expect(await r.weights.get(w.id)).toBeUndefined();
    expect((await r.weights.get(w.id, { includeDeleted: true }))?.deletedAt).toBeDefined();
    expect(await r.weights.list()).toEqual([]);
    expect(await r.weights.where('date', '2026-01-01')).toEqual([]);

    await r.weights.restore(w.id);
    const restored = await r.weights.get(w.id);
    expect(restored?.deletedAt).toBeUndefined();
    expect(await r.weights.where('date', '2026-01-01')).toHaveLength(1);

    await r.weights.hardDelete(w.id);
    expect(await r.weights.get(w.id, { includeDeleted: true })).toBeUndefined();
  });

  it('keeps a provided id and rejects operations on missing records', async () => {
    const m = await r.measurements.create({ id: 'm1', date: '2026-01-01', waistCm: 85 });
    expect(m.id).toBe('m1');
    await expect(r.measurements.update('nope', { waistCm: 1 })).rejects.toThrow('not found');
    await expect(r.measurements.softDelete('nope')).rejects.toThrow('not found');
    await expect(r.measurements.restore('nope')).rejects.toThrow('not found');
  });
});

describe('goals', () => {
  const goal = (validFrom: string, kcal: number) => ({
    validFrom,
    type: 'lose' as const,
    rateKgPerWeek: -0.5,
    kcal,
    protein: 160,
    fat: 60,
    carbs: 200,
    source: 'manual' as const,
  });

  it('goalFor: a change on the 10th does not affect the 9th', async () => {
    await r.goals.create(goal('2026-03-01', 2200));
    const g10 = await r.goals.create(goal('2026-03-10', 1900));
    expect(await r.goals.goalFor('2026-02-28')).toBeUndefined();
    expect((await r.goals.goalFor('2026-03-09'))?.kcal).toBe(2200);
    expect((await r.goals.goalFor('2026-03-10'))?.kcal).toBe(1900);
    await r.goals.softDelete(g10.id);
    expect((await r.goals.goalFor('2026-03-10'))?.kcal).toBe(2200);
  });
});

describe('entries', () => {
  const item = (name: string, grams: number, foodId?: string) => ({
    foodId,
    name,
    grams,
    nutrients: scaleNutrients(per100, grams),
  });

  it('computes totals and lists a day by time', async () => {
    await r.entries.add({
      date: '2026-01-02',
      time: '13:00',
      items: [item('a', 100)],
      source: 'manual',
    });
    const e1 = await r.entries.add({
      date: '2026-01-02',
      time: '08:30',
      items: [item('a', 50), item('b', 100)],
      source: 'manual',
    });
    await r.entries.add({
      date: '2026-01-03',
      time: '07:00',
      items: [item('c', 10)],
      source: 'quick',
    });
    const gone = await r.entries.add({
      date: '2026-01-02',
      time: '09:00',
      items: [],
      source: 'quick',
    });
    await r.entries.softDelete(gone.id);

    expect(e1.totals).toEqual({ kcal: 525, protein: 18, fat: 9, carbs: 90, fiber: 15 });
    const day = await r.entries.byDate('2026-01-02');
    expect(day.map((e) => e.time)).toEqual(['08:30', '13:00']);
    expect(await r.entries.inRange('2026-01-01', '2026-01-03')).toHaveLength(3);
    expect(await r.entries.inRange('2026-01-03', '2026-01-03')).toHaveLength(1);
  });

  it('recomputes totals only when items change', async () => {
    const e = await r.entries.add({
      date: '2026-01-02',
      time: '08:00',
      items: [item('a', 100)],
      source: 'manual',
    });
    const moved = await r.entries.edit(e.id, { date: '2026-01-01', time: '20:00' });
    expect(moved.totals.kcal).toBe(350);
    expect(await r.entries.byDate('2026-01-01')).toHaveLength(1);
    const edited = await r.entries.edit(e.id, { items: [item('a', 200)] });
    expect(edited.totals.kcal).toBe(700);
  });

  it('snapshot rule: editing a food does not change past entries', async () => {
    const f = await r.foods.add({
      name: 'Овсянка',
      per100g: per100,
      servings: [],
      source: 'user',
      verified: true,
    });
    const e = await r.entries.add({
      date: '2026-01-01',
      time: '08:00',
      items: [item('Овсянка', 60, f.id)],
      source: 'manual',
    });
    await r.foods.edit(f.id, { per100g: { ...per100, kcal: 999 } });
    const stored = await r.entries.get(e.id);
    expect(stored?.items[0]?.nutrients.kcal).toBeCloseTo(210);
    expect(stored?.totals.kcal).toBeCloseTo(210);
  });
});

describe('foods', () => {
  const base: Omit<Food, 'id' | 'createdAt' | 'updatedAt' | 'searchKey' | 'useCount'> = {
    name: 'Творог 5%',
    brand: 'Простоквашино Ёлки',
    barcode: '4600000000001',
    per100g: per100,
    servings: [{ label: 'пачка', grams: 180 }],
    source: 'off',
    verified: false,
  };

  it('normalizes search key and finds by barcode', async () => {
    const f = await r.foods.add(base);
    expect(f.searchKey).toBe('творог 5% простоквашино елки');
    expect(f.useCount).toBe(0);
    expect((await r.foods.byBarcode('4600000000001'))?.id).toBe(f.id);
    expect(await r.foods.byBarcode('0')).toBeUndefined();
    expect(foodSearchKey('Ёжик')).toBe('ежик');
  });

  it('updates search key on rename or brand change', async () => {
    const f = await r.foods.add(base);
    expect((await r.foods.edit(f.id, { name: 'Сыр' })).searchKey).toBe('сыр простоквашино елки');
    expect((await r.foods.edit(f.id, { brand: undefined })).searchKey).toBe('сыр');
    expect((await r.foods.edit(f.id, { verified: true })).searchKey).toBe('сыр');
    await expect(r.foods.edit('nope', { name: 'x' })).rejects.toThrow('not found');
  });

  it('tracks usage', async () => {
    const f = await r.foods.add({ ...base, useCount: 3 });
    await r.foods.markUsed(f.id, 180);
    const u = await r.foods.get(f.id);
    expect(u).toMatchObject({ useCount: 4, lastGrams: 180 });
    expect(u?.lastUsedAt).toBeDefined();
    await expect(r.foods.markUsed('nope', 1)).resolves.toBeUndefined();
  });
});

describe('weights', () => {
  it('latest and range', async () => {
    await r.weights.create({ date: '2026-01-02', time: '07:00', kg: 80, source: 'manual' });
    await r.weights.create({ date: '2026-01-02', time: '21:00', kg: 81, source: 'manual' });
    await r.weights.create({ date: '2026-01-01', time: '23:00', kg: 82, source: 'manual' });
    expect((await r.weights.latest())?.kg).toBe(81);
    expect(await r.weights.inRange('2026-01-02', '2026-01-02')).toHaveLength(2);
  });
});

describe('profile, dayMeta, settings, tdeeHistory', () => {
  it('profile upsert keeps createdAt', async () => {
    const data = {
      sex: 'male' as const,
      birthDate: '1990-01-01',
      heightCm: 180,
      activityLevel: 'light' as const,
      exerciseCaloriesMode: 'none' as const,
      weekStartsOn: 1 as const,
      units: 'metric' as const,
    };
    expect(await r.profile.get()).toBeUndefined();
    const p1 = await r.profile.save(data);
    const p2 = await r.profile.save({ ...data, heightCm: 181 });
    expect(p2.createdAt).toBe(p1.createdAt);
    expect((await r.profile.get())?.heightCm).toBe(181);
  });

  it('dayMeta defaults and upserts', async () => {
    expect(await r.dayMeta.get('2026-01-01')).toMatchObject({ complete: false, waterMl: 0 });
    await r.dayMeta.upsert('2026-01-01', { waterMl: 250 });
    const m = await r.dayMeta.upsert('2026-01-01', { complete: true });
    expect(m).toMatchObject({ date: '2026-01-01', complete: true, waterMl: 250 });
    await db.dayMeta.update('2026-01-01', { deletedAt: 'x' });
    expect((await r.dayMeta.get('2026-01-01')).waterMl).toBe(0);
    const revived = await r.dayMeta.upsert('2026-01-01', { steps: 5000 });
    expect(revived).toMatchObject({ waterMl: 0, steps: 5000 });
    expect(revived.deletedAt).toBeUndefined();
  });

  it('settings get/set/remove', async () => {
    expect(await r.settings.get('alpha', 0.1)).toBe(0.1);
    await r.settings.set('alpha', 0.15);
    await r.settings.set('alpha', 0.2);
    expect(await r.settings.get('alpha', 0.1)).toBe(0.2);
    await r.settings.remove('alpha');
    expect(await r.settings.get('alpha', 0.1)).toBe(0.1);
  });

  it('tdeeHistory upsert by date', async () => {
    const row = {
      date: '2026-01-01',
      trendKg: 80,
      tdee: 2600,
      confidence: 0.5,
      intakeAvg: 2400,
      windowDays: 21,
    };
    const a = await r.tdeeHistory.put(row);
    const b = await r.tdeeHistory.put({ ...row, tdee: 2650 });
    expect(b.createdAt).toBe(a.createdAt);
    expect((await r.tdeeHistory.get('2026-01-01'))?.tdee).toBe(2650);
  });
});

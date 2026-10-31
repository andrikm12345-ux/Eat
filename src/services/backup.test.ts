import { describe, expect, it } from 'vitest';
import { AI_KEYS } from '../ai/settings';
import { db } from '../db/db';
import { repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { seedOnboarded } from '../test/seed';
import { BackupError, exportCsv, exportJson, importJson, markBackup, parseBackup } from './backup';

async function seedAll() {
  await seedOnboarded();
  const f = await repos.foods.add({
    name: 'Творог',
    brand: 'Б',
    barcode: '46',
    per100g: { kcal: 120, protein: 18, fat: 5, carbs: 3, calcium: 120 },
    servings: [{ label: 'пачка', grams: 180 }],
    source: 'user',
    verified: true,
  });
  const e = await repos.entries.add({
    date: '2026-03-01',
    time: '08:00',
    items: [
      {
        foodId: f.id,
        name: 'Творог',
        grams: 180,
        nutrients: { kcal: 216, protein: 32.4, fat: 9, carbs: 5.4 },
        confidence: 'high',
      },
    ],
    source: 'manual',
    note: 'с ягодами, «вкусно»',
  });
  await repos.templates.create({
    name: 'Завтрак',
    items: [{ foodId: f.id, name: 'Творог', grams: 180, snapshot: e.totals }],
  });
  await repos.recipes.create({
    name: 'Сырники',
    ingredients: [{ foodId: f.id, grams: 400 }],
    steps: [{ text: 'Жарить' }],
    servingsCount: 4,
    cookedWeightG: 380,
    per100g: { kcal: 126, protein: 19, fat: 5, carbs: 3 },
  });
  await repos.dayMeta.upsert('2026-03-01', { complete: true, waterMl: 1500, steps: 8000 });
  await repos.measurements.create({
    date: '2026-03-01',
    neckCm: 38,
    waistCm: 90,
    bodyFatPct: 19.2,
    method: 'navy',
  });
  await repos.workouts.create({
    date: '2026-03-01',
    time: '18:00',
    type: 'Бег',
    durationMin: 30,
    kcal: 300,
    source: 'manual',
  });
  await repos.tdeeHistory.put({
    date: '2026-03-01',
    trendKg: 80,
    tdee: 2600,
    confidence: 0.4,
    intakeAvg: 2200,
    windowDays: 21,
  });
  await repos.checkins.create({
    weekStart: '2026-03-02',
    proposedKcal: 2190,
    tdee: 2600,
    trendDeltaKgPerWeek: -0.3,
    status: 'pending',
    explanation: 'x',
  });
  await repos.aiRuns.create({
    kind: 'text',
    model: 'm',
    request: { a: 1 },
    response: { b: [1, 2] },
    latencyMs: 10,
  });
  await db.achievements.put({
    id: 'first_entry',
    unlockedAt: '2026-03-01T08:00:00Z',
    progress: 1,
    createdAt: 'x',
    updatedAt: 'x',
  });
  await repos.blobs.create({
    blob: new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    kind: 'progress',
    date: '2026-03-01',
  });
  await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-SECRET');
  await repos.settings.set(SETTINGS.trendAlpha.key, 0.12);
}

const tablesOf = async () => {
  const b = await exportJson(repos, { includePhotos: true });
  return b.tables;
};

describe('backup', () => {
  it('export → clear → import restores everything bit for bit (except the API key)', async () => {
    await seedAll();
    const before = await tablesOf();
    const file = JSON.stringify(await exportJson(repos, { includePhotos: true }));
    expect(file).not.toContain('sk-ant-SECRET');
    await Promise.all(db.tables.map((t) => t.clear()));
    await importJson(repos, parseBackup(file), 'replace');
    expect(await tablesOf()).toEqual(before);
    expect(JSON.stringify(await tablesOf())).toBe(JSON.stringify(before));
    expect(await repos.settings.get(AI_KEYS.apiKey, '')).toBe('');
  });

  it('replace keeps the local API key; photos skipped when not included', async () => {
    await seedAll();
    const noPhotos = await exportJson(repos, { includePhotos: false });
    expect(noPhotos.tables.blobs).toBeUndefined();
    await importJson(repos, noPhotos, 'replace');
    expect(await repos.settings.get(AI_KEYS.apiKey, '')).toBe('sk-ant-SECRET');
    expect(await db.blobs.count()).toBe(1);
  });

  it('merge: newer updatedAt wins, new records are added', async () => {
    await seedAll();
    const backup = await exportJson(repos, { includePhotos: false });
    const [w] = await repos.weights.list();
    await repos.weights.update(w!.id, { kg: 79 }); // local is newer
    const [m] = await repos.measurements.list();
    (
      backup.tables.measurements as { id: string; waistCm: number; updatedAt: string }[]
    )[0]!.waistCm = 88;
    (backup.tables.measurements as { updatedAt: string }[])[0]!.updatedAt =
      '2999-01-01T00:00:00.000Z';
    (backup.tables.weights as unknown[]).push({
      id: 'new-w',
      date: '2026-02-01',
      time: '07:00',
      kg: 81,
      source: 'import',
      createdAt: 'a',
      updatedAt: 'a',
    });
    const res = await importJson(repos, backup, 'merge');
    expect(res.written).toBe(2);
    expect((await repos.weights.get(w!.id))?.kg).toBe(79);
    expect((await repos.measurements.get(m!.id))?.waistCm).toBe(88);
    expect(await repos.weights.get('new-w')).toBeDefined();
  });

  it('rejects foreign or newer files', () => {
    expect(() => parseBackup('{')).toThrow(BackupError);
    expect(() => parseBackup('{"a":1}')).toThrow('не резервная копия');
    expect(() =>
      parseBackup(JSON.stringify({ format: 'dnevnik-backup', schemaVersion: 99, tables: {} })),
    ).toThrow('более новой');
  });

  it('marks backups for the reminder', async () => {
    await markBackup(repos);
    await markBackup(repos);
    expect(await repos.settings.get(SETTINGS.backupCount.key, 0)).toBe(2);
    expect(await repos.settings.get(SETTINGS.lastBackupAt.key, '')).toMatch(/^\d{4}-/);
  });

  it('CSV exports', async () => {
    await seedAll();
    const csv = await exportCsv(repos);
    expect(Object.keys(csv)).toEqual([
      'diary-items.csv',
      'daily-totals.csv',
      'weights.csv',
      'measurements.csv',
      'workouts.csv',
    ]);
    expect(csv['diary-items.csv']).toContain('2026-03-01,08:00,,Творог,180,216,32.4,9,5.4,,manual');
    expect(csv['daily-totals.csv']).toContain('2026-03-01,216,32.4,9,5.4,0,2200,1500,8000,1');
    expect(csv['workouts.csv']).toContain('2026-03-01,18:00,Бег,30,300,manual');
  });
});

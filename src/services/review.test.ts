import { beforeEach, describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { type ReviewDraft, type ReviewItem } from '../state/review';
import { clarifyMessage } from './aiClarify';
import { correctedKeys, saveReview } from './review';

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  key: 'k1',
  name: 'Треугольник острый с курицей',
  grams: 250,
  per100g: { kcal: 275, protein: 11.5, fat: 12.5, carbs: 28 },
  source: 'ai',
  ...over,
});
const draft = (items: ReviewItem[]): ReviewDraft => ({
  items,
  entrySource: 'ai_text',
  date: '2026-03-01',
  time: '12:00',
  analysis: 'ai',
});

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
});

describe('correctedKeys', () => {
  it('finds AI items that the user edited by hand', () => {
    const base = [item(), item({ key: 'k2', name: 'Шейк' })];
    const now = [{ ...item(), source: 'manual' as const }, item({ key: 'k2', name: 'Шейк' })];
    expect(correctedKeys(base, now)).toEqual(['k1']);
  });
  it('ignores manual items that were not AI and items already linked to a food', () => {
    const base = [item({ source: 'manual' }), item({ key: 'k2', source: 'ai' })];
    const now = [
      item({ source: 'manual' }),
      item({ key: 'k2', source: 'manual', foodId: 'f1' }),
      item({ key: 'k3', source: 'manual' }),
    ];
    expect(correctedKeys(base, now)).toEqual([]);
  });
});

describe('saveReview: remembering corrections', () => {
  it('stores a corrected AI item as an own verified food and links the entry to it', async () => {
    const fixed = item({
      source: 'manual',
      per100g: { kcal: 200, protein: 10, fat: 6, carbs: 28 },
    });
    const e = await saveReview(draft([fixed]), { remember: new Set(['k1']) });
    const foods = await repos.foods.list();
    const f = foods.find((x) => x.name === fixed.name);
    expect(f?.source).toBe('user');
    expect(f?.verified).toBe(true);
    expect(f?.per100g.kcal).toBe(200);
    expect(e.items[0]?.foodId).toBe(f?.id);
    expect(e.totals.kcal).toBe(500);
  });

  it('updates the same remembered food next time instead of duplicating it', async () => {
    const a = item({ source: 'manual', per100g: { kcal: 200, protein: 10, fat: 6, carbs: 28 } });
    await saveReview(draft([a]), { remember: new Set(['k1']) });
    const b = { ...a, per100g: { kcal: 180, protein: 10, fat: 5, carbs: 27 } };
    await saveReview(draft([b]), { remember: new Set(['k1']) });
    const same = (await repos.foods.list()).filter((x) => x.name === a.name);
    expect(same).toHaveLength(1);
    expect(same[0]?.per100g.kcal).toBe(180);
  });

  it('does not touch the food list when nothing is to be remembered', async () => {
    const before = (await repos.foods.list()).length;
    const e = await saveReview(draft([item({ source: 'manual' })]));
    expect((await repos.foods.list()).length).toBe(before);
    expect(e.items[0]?.foodId).toBeUndefined();
  });
});

describe('clarifyMessage', () => {
  it('carries the previous estimate and the remark', () => {
    const m = clarifyMessage([item()], '  сыра внутри нет  ');
    expect(m).toContain('Треугольник острый с курицей');
    expect(m).toContain('"kcal":275');
    expect(m).toContain('сыра внутри нет');
    expect(m).not.toContain('  сыра');
  });
});

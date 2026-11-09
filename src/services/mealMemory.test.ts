import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { parseMealText } from '../domain/mealText';
import { reviewKey, type ReviewItem } from '../state/review';
import {
  itemsFromMemory,
  loadMemory,
  mapItemsToParts,
  MEMORY_LIMIT,
  MEMORY_SETTING,
  memoryKey,
  recall,
  rememberParts,
  type Memory,
} from './mealMemory';
import { analyzeMealByParts, groupAddOns } from './mealParts';
import { analyzeMealLocally } from './localMeal';
import { saveReview } from './review';

const n = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs });
const item = (name: string, grams: number, kcal: number, extra: Partial<ReviewItem> = {}) =>
  ({ key: reviewKey(), name, grams, per100g: n(kcal), source: 'ai', ...extra }) as ReviewItem;
const at = { date: '2026-11-08', time: '13:00' };

describe('meal memory', () => {
  it('a phrase is the same words in any order, without quantities', () => {
    const [a, b] = parseMealText('самса с курицей 2 шт, 2 шт самса с курицей');
    expect(memoryKey(a!.query)).toBe(memoryKey(b!.query));
    expect(memoryKey('Самса с курицей')).toBe(memoryKey('курицей самса с'));
  });

  it('gives each AI item to the fragment it shares words with', () => {
    const all = parseMealText(
      'Хачапури с сыром и ветчиной пятёрочка кафе, чай с двумя ложками сахара, стакан томатного сока',
    );
    const parts = groupAddOns(all, new Set(all));
    const items = [
      item('Хачапури с сыром и ветчиной', 120, 572),
      item('Чай', 240, 0),
      item('Сахар', 10, 387),
      item('Томатный сок', 250, 18),
      item('Что-то непонятное', 10, 100),
    ];
    const mapped = mapItemsToParts(parts, items);
    const names = (i: number) =>
      mapped[i]!.itemKeys.map((k) => items.find((x) => x.key === k)!.name);
    expect(mapped).toHaveLength(3);
    expect(names(0)).toEqual(['Хачапури с сыром и ветчиной']);
    expect(names(1)).toEqual(['Чай', 'Сахар']);
    expect(names(2)).toEqual(['Томатный сок']);
    // one fragment owns everything, hidden oil included
    const one = parseMealText('бутерброд с сыром');
    expect(
      mapItemsToParts(one, [item('Хлеб', 30, 250), item('Масло', 5, 740)])[0]!.itemKeys,
    ).toHaveLength(2);
  });

  it('scales a remembered phrase to the quantity said now', () => {
    const entry = {
      phrase: 'самса с курицей',
      count: 1,
      at: '',
      items: [{ name: 'Самса', grams: 120, per100g: n(360), piece: { grams: 120 } }],
    };
    const [two] = parseMealText('2 самсы с курицей');
    expect(itemsFromMemory(entry, two!)[0]).toMatchObject({ grams: 240, source: 'memory' });
    const [heavy] = parseMealText('самса с курицей 150 г');
    expect(itemsFromMemory(entry, heavy!)[0]!.grams).toBe(150);
    const tea = {
      phrase: 'чай с сахаром',
      count: 1,
      at: '',
      items: [
        { name: 'Чай', grams: 240, per100g: n(0) },
        { name: 'Сахар', grams: 10, per100g: n(387) },
      ],
    };
    const [big] = parseMealText('чай с сахаром 500 мл');
    expect(itemsFromMemory(tea, big!).map((i) => i.grams)).toEqual([480, 20]);
  });

  it('remembers what was saved, corrections included, and keeps the newest phrases', async () => {
    const [p] = parseMealText('хачапури пятёрочка кафе');
    const fixed = item('Хачапури', 120, 572, { source: 'manual' });
    await rememberParts(
      repos,
      [{ key: memoryKey(p!.query), phrase: p!.raw, count: 1, itemKeys: [fixed.key, 'gone'] }],
      [fixed],
    );
    const mem = await loadMemory(repos);
    expect(recall(mem, p!)?.items).toEqual([{ name: 'Хачапури', grams: 120, per100g: n(572) }]);

    const many: Memory = {};
    for (let i = 0; i < MEMORY_LIMIT + 5; i++)
      many[`k${i}`] = {
        phrase: `k${i}`,
        count: 1,
        at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
        items: [],
      };
    await repos.settings.set(MEMORY_SETTING, many);
    await rememberParts(
      repos,
      [{ key: memoryKey(p!.query), phrase: p!.raw, count: 1, itemKeys: [fixed.key] }],
      [fixed],
    );
    const after = await loadMemory(repos);
    expect(Object.keys(after)).toHaveLength(MEMORY_LIMIT);
    expect(recall(after, p!)).toBeDefined();
  });

  it('a saved description comes back at once the next time, without the AI', async () => {
    const text = 'хачапури с сыром и ветчиной пятёрочка кафе, самса с курицей пятёрочка кафе';
    const all = parseMealText(text);
    const parts = groupAddOns(all, new Set(all));
    const ai = [item('Хачапури с сыром и ветчиной', 300, 270), item('Самса с курицей', 130, 300)];
    const memory = mapItemsToParts(parts, ai);
    // the user fixes the khachapuri to 120 g, 572 kcal per 100 g and saves
    const saved = [
      { ...ai[0]!, grams: 120, per100g: n(572, 18, 37, 40), source: 'manual' as const },
      ai[1]!,
    ];
    await saveReview(
      { items: saved, entrySource: 'ai_text', analysis: 'ai', ...at, memory },
      { remember: new Set() },
    );

    // No AI is configured in tests: had it been asked, this would throw.
    const next = await analyzeMealByParts(repos, text, at);
    expect(next.analysis).toBe('local');
    expect(next.items.map((i) => [i.name, i.grams, i.per100g.kcal, i.source])).toEqual([
      ['Хачапури с сыром и ветчиной', 120, 572, 'memory'],
      ['Самса с курицей', 130, 300, 'memory'],
    ]);
    // the quick result without the AI knows it too
    const quick = await analyzeMealLocally(repos, text, at, { online: false });
    expect(quick.items[0]).toMatchObject({ grams: 120, source: 'memory' });
    expect(quick.memory).toHaveLength(2);
  });

  it('with remembering switched off nothing is remembered', async () => {
    const text = 'самса с курицей пятёрочка кафе';
    const all = parseMealText(text);
    const ai = [item('Самса с курицей', 120, 360)];
    await saveReview({
      items: ai,
      entrySource: 'ai_text',
      analysis: 'ai',
      ...at,
      memory: mapItemsToParts(all, ai),
    });
    expect(await loadMemory(repos)).toEqual({});
  });
});

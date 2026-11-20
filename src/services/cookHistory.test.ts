import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { DEFAULT_COOK_FORM } from '../state/cook';
import type { CookDish, CookResult } from './cook';
import {
  COOK_HISTORY_LIMIT,
  loadCookHistory,
  recordCookRecipe,
  recordCookSearch,
} from './cookHistory';
import { buildSnapshot } from './sync';

const n = (kcal: number, protein = 0) => ({ kcal, protein, fat: 0, carbs: 0 });
const dish = (name: string): CookDish => ({
  idea: { name, minutes: 20, difficulty: 'easy', ingredients: [] },
  ingredients: [],
  missing: name === 'Сырники' ? ['Яйцо куриное'] : [],
  short: [],
  main: null,
  mainMissing: false,
  usedPantry: 1,
  haveShare: 1,
  perServing: n(412.4, 30.25),
  score: 1,
  resolved: [
    { name: 'Творог', grams: 150, per100g: n(120), from: 'ai' },
    { name: 'Мука', grams: 33.33, per100g: n(340), from: 'catalog' },
  ],
});
const result = (names: string[]): CookResult => ({
  dishes: names.map(dish),
  rejected: [{ name: 'Борщ', reason: 'main', missing: ['Говядина'] }],
  retried: false,
});
const form = {
  ...DEFAULT_COOK_FORM,
  text: 'творог 400 г, мука',
  noBuy: true,
  wishes: 'без сахара',
};

describe('«Что приготовить» history', () => {
  it('keeps what was written, the conditions, the dishes and the opened recipes', async () => {
    const id = await recordCookSearch(repos, form, result(['Сырники', 'Ленивые вареники']));
    const steps = {
      steps: [
        { text: 'Смешайте', minutes: 5 },
        { text: 'Жарьте', minutes: 0 },
      ],
      tip: 'Сразу',
    };
    await recordCookRecipe(repos, id, dish('Сырники'), 2, steps);
    await recordCookRecipe(repos, id, dish('Сырники'), 2, steps); // once per dish
    const [h] = await loadCookHistory(repos);
    expect(h).toMatchObject({
      id,
      pantry: 'творог 400 г, мука',
      conditions: { noBuy: true, servings: 1, wishes: 'без сахара', basics: true },
      rejected: 1,
      dishes: [
        { name: 'Сырники', minutes: 20, kcal: 412, protein: 30.3, missing: ['Яйцо куриное'] },
        { name: 'Ленивые вареники', missing: [] },
      ],
    });
    expect(h!.recipes).toEqual([
      {
        name: 'Сырники',
        servings: 2,
        ingredients: ['Творог 300 г', 'Мука 66.7 г'],
        steps: ['Смешайте (5 мин)', 'Жарьте'],
        tip: 'Сразу',
      },
    ]);
  });

  it('keeps the newest searches only and goes to the cloud with the diary', async () => {
    for (let i = 0; i < COOK_HISTORY_LIMIT + 3; i++)
      await recordCookSearch(repos, { ...form, text: `запрос ${i}` }, result([]));
    const list = await loadCookHistory(repos);
    expect(list).toHaveLength(COOK_HISTORY_LIMIT);
    expect(list[0]!.pantry).toBe(`запрос ${COOK_HISTORY_LIMIT + 2}`);
    const snap = await buildSnapshot(repos);
    const row = (snap.tables.settings as { key: string; value: unknown }[]).find(
      (s) => s.key === 'cookHistory',
    );
    expect(row?.value).toHaveLength(COOK_HISTORY_LIMIT);
  });
});

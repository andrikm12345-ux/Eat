import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { clearAiMealLabels } from './cleanup';

const nutrients = { kcal: 405, protein: 18, fat: 21, carbs: 39 };
const item = { name: 'Хачапури', grams: 150, nutrients };
const base = { date: '2026-11-06', time: '21:15', items: [item] };

describe('clearAiMealLabels', () => {
  it('clears the AI guess from untouched AI entries only', async () => {
    const ai = await repos.entries.add({ ...base, source: 'ai_text', mealLabel: 'Завтрак' });
    const photo = await repos.entries.add({ ...base, source: 'ai_photo', mealLabel: 'Обед' });
    const own = await repos.entries.add({ ...base, source: 'manual', mealLabel: 'Завтрак' });
    const named = await repos.entries.add({
      ...base,
      source: 'ai_text',
      mealLabel: 'Мама готовила',
    });
    const edited = await repos.entries.add({ ...base, source: 'ai_text', mealLabel: 'Ужин' });
    await new Promise((r) => setTimeout(r, 5));
    await repos.entries.edit(edited.id, { note: 'вкусно' });

    expect(await clearAiMealLabels(repos)).toBe(2);
    expect((await repos.entries.get(ai.id))?.mealLabel).toBeUndefined();
    expect((await repos.entries.get(photo.id))?.mealLabel).toBeUndefined();
    expect((await repos.entries.get(own.id))?.mealLabel).toBe('Завтрак');
    expect((await repos.entries.get(named.id))?.mealLabel).toBe('Мама готовила');
    expect((await repos.entries.get(edited.id))?.mealLabel).toBe('Ужин');
    // a second run finds nothing left
    expect(await clearAiMealLabels(repos)).toBe(0);
  });
});

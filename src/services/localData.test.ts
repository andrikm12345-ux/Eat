import { beforeEach, describe, expect, it } from 'vitest';
import { BASE_FOODS_SETTING } from '../db/baseFoods';
import { repos } from '../db/repos';
import { seedOnboarded } from '../test/seed';
import { clearLocalData } from './localData';

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
});

describe('clearLocalData', () => {
  it('removes what the user entered, keeps the sign-in, the AI settings and the bundled catalog', async () => {
    await seedOnboarded();
    await repos.entries.add({
      date: '2026-03-01',
      time: '12:00',
      source: 'manual',
      items: [{ name: 'Суп', grams: 100, nutrients: { kcal: 50, protein: 2, fat: 2, carbs: 5 } }],
    });
    await repos.foods.add({
      name: 'Мой продукт',
      per100g: { kcal: 100, protein: 1, fat: 1, carbs: 1 },
      servings: [],
      source: 'user',
      verified: true,
    });
    await repos.foods.add({
      name: 'Из каталога',
      per100g: { kcal: 10, protein: 1, fat: 1, carbs: 1 },
      servings: [],
      source: 'base',
      verified: true,
    });
    await repos.settings.set('accountToken', 'tok');
    await repos.settings.set('accountLogin', 'ivan');
    await repos.settings.set('aiApiKey', 'k');
    await repos.settings.set(BASE_FOODS_SETTING, 'v1');
    await repos.settings.set('bannerDismissed:x', true);

    await clearLocalData(repos);

    expect(await repos.db.profile.count()).toBe(0);
    expect(await repos.db.goals.count()).toBe(0);
    expect(await repos.db.entries.count()).toBe(0);
    expect(await repos.db.weights.count()).toBe(0);
    const foods = await repos.foods.list();
    expect(foods.map((f) => f.name)).toEqual(['Из каталога']);
    expect(await repos.settings.get('accountToken', '')).toBe('tok');
    expect(await repos.settings.get('accountLogin', '')).toBe('ivan');
    expect(await repos.settings.get('aiApiKey', '')).toBe('k');
    expect(await repos.settings.get(BASE_FOODS_SETTING, '')).toBe('v1');
    expect(await repos.settings.get('bannerDismissed:x', false)).toBe(false);
  });

  it('is harmless on an empty browser', async () => {
    await expect(clearLocalData(repos)).resolves.toBeUndefined();
  });
});

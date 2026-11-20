import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { buildIndex } from '../domain/search';
import type { DishIdea } from '../domain/cook';
import type { Food } from '../domain/types';
import {
  dishToDraft,
  ideasMessage,
  perServing,
  resolveIngredient,
  saveDishAsRecipe,
  type CookDish,
} from './cook';

const n = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs });

async function catalog() {
  const add = (name: string, per100g: ReturnType<typeof n>) =>
    repos.foods.add({ name, per100g, servings: [], source: 'base', verified: true });
  await add('Рис круглозёрный (крупа)', n(350, 7, 1, 78));
  await add('Рис круглозёрный варёный', n(130, 2.4, 0.3, 29));
  await add('Куриная грудка (сырая)', n(120, 23, 2.6, 0));
  return buildIndex<Food>(await repos.foods.list());
}

const dishOf = (idea: DishIdea, index: Awaited<ReturnType<typeof catalog>>): CookDish => {
  const resolved = idea.ingredients.map((i) => resolveIngredient(index, i));
  return {
    idea,
    ingredients: [],
    missing: [],
    short: [],
    main: null,
    mainMissing: false,
    usedPantry: 1,
    haveShare: 1,
    perServing: perServing(resolved),
    score: 0,
    resolved,
  };
};

describe('cooking service', () => {
  it('a catalog product is used only when its calories agree: dry rice is not cooked rice', async () => {
    const index = await catalog();
    const dry = resolveIngredient(index, {
      name: 'Рис круглозёрный',
      grams: 70,
      per100g: n(340, 7, 1, 77),
    });
    expect(dry).toMatchObject({ from: 'catalog', per100g: { kcal: 350 } });
    const boiled = resolveIngredient(index, {
      name: 'Рис круглозёрный',
      grams: 200,
      per100g: n(125, 2.5, 0.3, 28),
    });
    expect(boiled.per100g.kcal).toBe(130);
    // Nothing close in calories: the AI's own values stay.
    const odd = resolveIngredient(index, { name: 'Рис круглозёрный', grams: 70, per100g: n(800) });
    expect(odd).toMatchObject({ from: 'ai', per100g: { kcal: 800 } });
    const none = resolveIngredient(index, { name: 'Зира', grams: 2, per100g: n(375) });
    expect(none.from).toBe('ai');
  });

  it('the request carries the pantry, the wishes and what is left of the day', () => {
    const text = ideasMessage(
      {
        pantry: [
          { name: 'курица', grams: 500, count: null },
          { name: 'яйца', grams: null, count: 4 },
          { name: 'лук', grams: null, count: null },
        ],
        basics: true,
        noBuy: true,
        maxMinutes: 30,
        servings: 2,
        meal: 'dinner',
        wishes: 'без свинины',
        equipment: ['stove', 'microwave'],
        left: { kcal: 640, protein: 35 },
      },
      ['Борщ (нет: Свёкла)'],
    );
    expect(text).toContain('курица 500 г; яйца 4 шт; лук');
    expect(text).toContain('Всегда есть: соль');
    expect(text).toContain('Порций: 2');
    expect(text).toContain('не больше 30 минут');
    expect(text).toContain('ужин');
    expect(text).toContain('Ничего не докупать');
    expect(text).toContain('без свинины');
    expect(text).toContain('Есть: плита, микроволновка. Нет: духовка, аэрогриль, мультиварка');
    expect(text).toContain('640 ккал и 35 г белка');
    expect(text).toContain('Не предлагай: Борщ (нет: Свёкла)');
  });

  it('one serving goes to the check screen without water and salt', async () => {
    const index = await catalog();
    const dish = dishOf(
      {
        name: 'Курица с рисом',
        minutes: 30,
        difficulty: 'easy',
        ingredients: [
          { name: 'Куриная грудка', grams: 150, per100g: n(115, 23, 2, 0) },
          { name: 'Рис круглозёрный', grams: 70, per100g: n(340, 7, 1, 77) },
          { name: 'Вода', grams: 150, per100g: n(0) },
          { name: 'Соль', grams: 2, per100g: n(0) },
        ],
      },
      index,
    );
    const draft = dishToDraft(dish, { date: '2026-11-20', time: '19:00' }, 'note');
    expect(draft.items.map((i) => [i.name, i.grams, i.source])).toEqual([
      ['Куриная грудка', 150, 'catalog'],
      ['Рис круглозёрный', 70, 'catalog'],
    ]);
    expect(draft).toMatchObject({
      mealLabel: 'Курица с рисом',
      entrySource: 'ai_text',
      notes: 'note',
    });
    expect(dish.perServing.kcal).toBeCloseTo(150 * 1.2 + 70 * 3.5, 5);
  });

  it('a saved recipe keeps steps and the ready weight, so drained water does not dilute it', async () => {
    const index = await catalog();
    const dish = dishOf(
      {
        name: 'Ленивые вареники',
        minutes: 30,
        difficulty: 'medium',
        portionGrams: 250,
        ingredients: [
          { name: 'Творог', grams: 200, per100g: n(120, 17, 5, 2) },
          { name: 'Мука пшеничная', grams: 50, per100g: n(340, 10, 1, 70) },
          { name: 'Вода', grams: 500, per100g: n(0) },
        ],
      },
      index,
    );
    const r = await saveDishAsRecipe(repos, dish, 2, {
      steps: [
        { text: 'Смешайте творог и муку', minutes: 5 },
        { text: 'Варите', minutes: 0 },
      ],
      tip: 'Не переваривайте',
    });
    expect(r.servingsCount).toBe(2);
    expect(r.cookedWeightG).toBe(500);
    expect(r.steps.map((s) => s.text)).toEqual([
      'Смешайте творог и муку (5 мин)',
      'Варите',
      'Совет: Не переваривайте',
    ]);
    // (200×120 + 50×340) × 2 / 500 g × 100 = 164 kcal per 100 g of the ready dish
    expect(r.per100g.kcal).toBeCloseTo(164, 5);
    // The products not in the catalog became the person's own, and are reused next time.
    await saveDishAsRecipe(repos, dish, 1, { steps: [{ text: 'Варите', minutes: 5 }], tip: '' });
    const own = (await repos.foods.list()).filter((f) => f.source === 'user');
    expect(own.map((f) => f.name).sort()).toEqual(['Вода', 'Мука пшеничная', 'Творог']);
  });
});

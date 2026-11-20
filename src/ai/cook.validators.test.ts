import { describe, expect, it } from 'vitest';
import { validateCookIdeas } from './cookValidators';

const n = { kcal: 100, protein: 5, fat: 2, carbs: 10 };
const dish = (extra: object = {}) => ({
  name: 'Омлет',
  minutes: 10,
  difficulty: 'easy',
  ingredients: [{ name: 'Яйцо куриное', grams: 110, per100g: n }],
  ...extra,
});

describe('answer with dishes', () => {
  it('an empty list or only "not real" dishes is an answer, not a broken format', () => {
    expect(validateCookIdeas({ dishes: [] })).toEqual({ ok: true, value: [] });
    expect(validateCookIdeas({ dishes: [dish({ classic: false })] })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('real dishes pass; a dish marked as not real is left out', () => {
    const r = validateCookIdeas({
      dishes: [dish(), dish({ name: 'Кефир с сахаром', classic: false })],
    });
    expect(r.ok && r.value.map((d) => d.name)).toEqual(['Омлет']);
  });

  it('dishes that are all broken fail (the AI is asked again); a broken one beside a good one is dropped', () => {
    expect(validateCookIdeas({ dishes: [{ name: 'x' }] }).ok).toBe(false);
    const r = validateCookIdeas({ dishes: [dish(), { name: 'x' }] });
    expect(r.ok && r.value).toHaveLength(1);
    expect(validateCookIdeas({}).ok).toBe(false);
  });
});

describe('equipment of a dish', () => {
  it('keeps the known kinds once, drops the rest; missing means nothing special', () => {
    const r = validateCookIdeas({
      dishes: [dish({ equipment: ['oven', 'oven', 'stove', 'таймер'] }), dish({ name: 'Салат' })],
    });
    expect(r.ok && r.value.map((d) => d.equipment)).toEqual([['oven', 'stove'], undefined]);
    const bad = validateCookIdeas({ dishes: [dish({ equipment: 'oven' })] });
    expect(bad.ok && bad.value[0]).not.toHaveProperty('equipment');
  });
});

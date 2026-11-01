import { describe, expect, it } from 'vitest';
import { exerciseBonus, findMet, MET_TABLE, metKcal, netKcal, WORKOUT_KINDS } from './met';
import { recipePer100g, servingGrams } from './recipe';

describe('recipe', () => {
  const ing = [
    { per100g: { kcal: 340, protein: 12, fat: 1.5, carbs: 70 }, grams: 200 }, // dry pasta
    { per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, grams: 0 },
    { per100g: { kcal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 }, grams: 20 }, // oil
  ];
  it('per 100 g of the cooked dish (water uptake / boil-off)', () => {
    // total = 680 + 176.8 = 856.8 kcal; cooked 500 g → 171.36 / 100 g
    const r = recipePer100g(ing, 500);
    expect(r.kcal).toBeCloseTo(171.36);
    expect(r.fat).toBeCloseTo((3 + 20) / 5);
    // without cooked weight: raw 220 g
    expect(recipePer100g(ing).kcal).toBeCloseTo(856.8 / 2.2);
    expect(recipePer100g([]).kcal).toBe(0);
  });
  it('serving size', () => {
    expect(servingGrams(ing, 500, 4)).toBe(125);
    expect(servingGrams(ing, null, 2)).toBe(110);
    expect(servingGrams(ing, 500, 0)).toBe(500);
  });
});

describe('MET', () => {
  it('has ~30+ activities and computes kcal', () => {
    expect(MET_TABLE.length).toBeGreaterThanOrEqual(30);
    expect(metKcal(8, 80, 45)).toBe(480);
    // Net = above resting: (8 − 1) × 80 × 0.75 = 420; never negative.
    expect(netKcal(8, 80, 45)).toBe(420);
    expect(netKcal(0.5, 80, 45)).toBe(0);
    // Compendium 2024: calisthenics light / moderate / vigorous.
    expect(WORKOUT_KINDS.find((k) => k.id === 'bars')?.met).toEqual({
      light: 2.8,
      moderate: 3.8,
      hard: 7.5,
    });
    expect(findMet('Йога')?.met).toBe(2.5);
    expect(findMet('run_10')?.met).toBe(9.8);
    expect(findMet('нет такого')).toBeUndefined();
  });
  it('exercise calories mode', () => {
    expect(exerciseBonus('none', 500)).toBe(0);
    expect(exerciseBonus('half', 501)).toBe(251);
    expect(exerciseBonus('full', 500)).toBe(500);
    expect(exerciseBonus('full', 0)).toBe(0);
  });
});

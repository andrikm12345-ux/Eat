import { describe, expect, it } from 'vitest';
import { initialMeal, mealByTime } from './meal';

describe('meal', () => {
  it('by time of day', () => {
    expect(mealByTime('04:59')).toBe('Перекус');
    expect(mealByTime('05:00')).toBe('Завтрак');
    expect(mealByTime('10:59')).toBe('Завтрак');
    expect(mealByTime('11:00')).toBe('Обед');
    expect(mealByTime('15:59')).toBe('Обед');
    expect(mealByTime('16:00')).toBe('Перекус');
    expect(mealByTime('17:00')).toBe('Ужин');
    expect(mealByTime('21:59')).toBe('Ужин');
    expect(mealByTime('22:00')).toBe('Перекус');
  });
  it('prefers a known AI guess, otherwise the time', () => {
    expect(initialMeal('обед', '08:00')).toBe('Обед');
    expect(initialMeal('Ужин', '08:00')).toBe('Ужин');
    expect(initialMeal('ланч', '08:00')).toBe('Завтрак');
    expect(initialMeal(undefined, '19:00')).toBe('Ужин');
  });
});

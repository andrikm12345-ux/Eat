import { describe, expect, it } from 'vitest';
import {
  dayStatus,
  dayTotals,
  entryTitle,
  frequentAround,
  groupStacks,
  minutesToTime,
  rescaleItem,
  timeToMinutes,
} from './day';

describe('time helpers', () => {
  it('converts', () => {
    expect(timeToMinutes('07:30')).toBe(450);
    expect(minutesToTime(450)).toBe('07:30');
    expect(minutesToTime(-5)).toBe('00:00');
    expect(minutesToTime(2000)).toBe('23:59');
  });
});

describe('groupStacks', () => {
  it('chains entries within 30 minutes', () => {
    const e = (time: string) => ({ time });
    const s = groupStacks([e('08:40'), e('08:00'), e('08:30'), e('09:11'), e('13:00'), e('13:30')]);
    expect(s.map((x) => x.map((y) => y.time))).toEqual([
      ['08:00', '08:30', '08:40'],
      ['09:11'],
      ['13:00', '13:30'],
    ]);
    expect(groupStacks([])).toEqual([]);
  });
});

describe('entries', () => {
  const nut = { kcal: 200, protein: 10, fat: 5, carbs: 20 };
  it('titles', () => {
    expect(entryTitle({ mealLabel: 'Завтрак', items: [] })).toBe('Завтрак');
    expect(
      entryTitle({
        items: [
          { name: 'Овсянка', grams: 1, nutrients: nut },
          { name: 'Банан', grams: 1, nutrients: nut },
        ],
      }),
    ).toBe('Овсянка, Банан');
    expect(entryTitle({ items: [{ name: 'x'.repeat(80), grams: 1, nutrients: nut }] }, 10)).toBe(
      'xxxxxxxxx…',
    );
  });
  it('titles with a meal: meal and item names, cut to the limit', () => {
    const items = [
      { name: 'Овсянка', grams: 1, nutrients: nut },
      { name: 'Банан', grams: 1, nutrients: nut },
    ];
    expect(entryTitle({ mealLabel: 'Завтрак', items })).toBe('Завтрак · Овсянка, Банан');
    expect(entryTitle({ mealLabel: 'Завтрак', items }, 12)).toBe('Завтрак · О…');
    // A custom label (e.g. a recipe name) is shown as it is.
    expect(entryTitle({ mealLabel: 'Мой борщ', items })).toBe('Мой борщ');
  });
  it('rescales items proportionally', () => {
    const it2 = rescaleItem({ name: 'a', grams: 100, nutrients: { ...nut, fiber: 2 } }, 150);
    expect(it2.nutrients).toEqual({ kcal: 300, protein: 15, fat: 7.5, carbs: 30, fiber: 3 });
    expect(rescaleItem({ name: 'q', grams: 0, nutrients: nut }, 50)).toEqual({
      name: 'q',
      grams: 50,
      nutrients: nut,
    });
  });
  it('totals and status', () => {
    expect(dayTotals([{ totals: nut }, { totals: nut }]).kcal).toBe(400);
    expect(dayStatus(0, 2000)).toBe('empty');
    expect(dayStatus(1500, 2000)).toBe('below');
    expect(dayStatus(1900, 2000)).toBe('close');
    expect(dayStatus(2300, 2000)).toBe('above');
    expect(dayStatus(2300, undefined)).toBe('close');
  });
});

describe('frequentAround', () => {
  const e = (time: string, ...ids: (string | undefined)[]) => ({
    time,
    items: ids.map((foodId) => ({
      foodId,
      name: 'x',
      grams: 1,
      nutrients: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    })),
  });
  it('ranks foods eaten around the current time', () => {
    const list = [
      e('08:00', 'oat', 'coffee'),
      e('08:30', 'oat'),
      e('13:00', 'soup', 'coffee'),
      e('07:30', 'coffee', undefined),
      e('23:30', 'kefir'),
    ];
    expect(frequentAround(list, 8 * 60)).toEqual(['coffee', 'oat']);
    expect(frequentAround(list, 13 * 60, { windowMin: 30 })).toEqual(['coffee', 'soup']);
    expect(frequentAround(list, 30)).toEqual(['kefir']);
    expect(frequentAround(list, 8 * 60, { limit: 1 })).toEqual(['coffee']);
  });
});

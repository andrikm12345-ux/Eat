import { describe, expect, it } from 'vitest';
import { habitsFrom, topUps, type Habit } from './topUp';
import type { Entry } from './types';

const per = (kcal: number, protein: number) => ({ kcal, protein, fat: 0, carbs: 0 });
let id = 0;
const entry = (date: string, name: string, grams: number, kcal100: number, p100: number) =>
  ({
    id: `e${++id}`,
    date,
    time: '12:00',
    source: 'manual',
    items: [
      {
        name,
        grams,
        nutrients: {
          kcal: (kcal100 * grams) / 100,
          protein: (p100 * grams) / 100,
          fat: 0,
          carbs: 0,
        },
      },
    ],
    totals: per(0, 0),
    createdAt: '',
    updatedAt: '',
  }) as unknown as Entry;

describe('top up the day', () => {
  it('learns the usual portion of each food, most frequent first', () => {
    const h = habitsFrom([
      entry('2026-11-01', 'Творог 5%', 180, 121, 17),
      entry('2026-11-02', 'Творог 5%', 200, 121, 17),
      entry('2026-11-03', 'Творог 5%', 220, 121, 17),
      entry('2026-11-03', 'Банан', 120, 89, 1.1),
      entry('2026-11-03', 'Чай', 250, 1, 0),
    ]);
    expect(h.map((x) => [x.name, x.grams, x.uses])).toEqual([
      ['Творог 5%', 200, 3],
      ['Банан', 120, 1],
    ]);
    expect(h[0]!.per100g.kcal).toBeCloseTo(121);
  });

  it('fits the calories left, prefers protein, gives different ideas', () => {
    const habits: Habit[] = [
      { name: 'Творог', grams: 200, per100g: per(121, 17), uses: 10 },
      { name: 'Куриная грудка', grams: 150, per100g: per(165, 31), uses: 6 },
      { name: 'Гречка', grams: 200, per100g: per(92, 3.4), uses: 8 },
      { name: 'Банан', grams: 120, per100g: per(89, 1.1), uses: 9 },
      { name: 'Торт', grams: 150, per100g: per(400, 4), uses: 2 },
    ];
    const ideas = topUps(habits, { kcal: 450, protein: 50 });
    expect(ideas.length).toBe(3);
    for (const o of ideas) expect(o.total.kcal).toBeLessThanOrEqual(450 * 1.05 + 20);
    // the best idea brings a lot of protein
    expect(ideas[0]!.total.protein).toBeGreaterThan(40);
    // nothing for a day that is already full
    expect(topUps(habits, { kcal: 60, protein: 0 })).toEqual([]);
  });
});

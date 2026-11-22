import { describe, expect, it } from 'vitest';
import { habitsFrom, kindOf, topUps, type Habit } from './topUp';
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

  describe('evening, eaten today, fat left (a new user with a short diary)', () => {
    const names = (ideas: ReturnType<typeof topUps>) =>
      ideas.flatMap((o) => o.items.map((h) => h.name));
    const evening = {
      hour: 21,
      eatenToday: ['Яйца варёные', 'Чикенбургер'],
      goalType: 'lose' as const,
    };

    it('knows the kinds', () => {
      expect(kindOf('Яйцо куриное')).toBe('egg');
      expect(kindOf('Творог 5%')).toBe('curd');
      expect(kindOf('Хачапури с сыром и ветчиной')).toBe('meat');
      expect(kindOf('Куриная грудка')).toBe('meat');
      expect(kindOf('Торт Неаполь')).toBe('sweet');
      expect(kindOf('Печенье овсяное')).toBe('sweet');
      expect(kindOf('Кефир')).toBe('other');
    });

    it('600 kcal, almost no fat, protein needed, before sleep: no meat, curd or eggs', () => {
      const ideas = topUps([], { kcal: 600, protein: 60, fat: 2 }, 3, evening);
      expect(ideas.length).toBeGreaterThan(0);
      for (const name of names(ideas)) {
        expect(['meat', 'curd', 'egg']).not.toContain(kindOf(name));
      }
      for (const o of ideas) {
        expect(o.total.kcal).toBeLessThanOrEqual(600 * 1.05 + 20);
        expect(o.total.fat).toBeLessThanOrEqual(2 * 1.1 + 5);
      }
      expect(ideas[0]!.total.protein).toBeGreaterThan(25);
    });

    it('in the morning curd and chicken are fine, eggs eaten today are not offered again', () => {
      const ideas = topUps([], { kcal: 500, protein: 60 }, 5, { hour: 9, eatenToday: ['Яйцо'] });
      const all = names(ideas);
      expect(all.some((x) => kindOf(x) === 'curd' || kindOf(x) === 'meat')).toBe(true);
      expect(all.some((x) => kindOf(x) === 'egg')).toBe(false);
    });

    it('does not offer a one-off huge portion from the diary', () => {
      const habits: Habit[] = [
        { name: 'Молочный напиток', grams: 910, per100g: per(60, 3), uses: 1 },
      ];
      const ideas = topUps(habits, { kcal: 900, protein: 30 }, 3, { hour: 12 });
      expect(names(ideas)).not.toContain('Молочный напиток');
    });
  });

  describe('what to buy: only the shop list, within the time for cooking', () => {
    it('after work: nothing that needs cooking, and no own foods', () => {
      const own: Habit[] = [{ name: 'Рис с овощами', grams: 200, per100g: per(120, 4), uses: 9 }];
      const ideas = topUps(own, { kcal: 600, protein: 60, fat: 5 }, 5, {
        hour: 20,
        storeOnly: true,
        maxMinutes: 5,
      });
      expect(ideas.length).toBeGreaterThan(0);
      for (const o of ideas) {
        expect(o.minutes).toBeLessThanOrEqual(5);
        expect(o.items.every((h) => h.store)).toBe(true);
      }
    });

    it('with more time, things that are cooked can come', () => {
      const ideas = topUps([], { kcal: 600, protein: 60, fat: 20 }, 8, {
        hour: 14,
        storeOnly: true,
        maxMinutes: null,
      });
      expect(ideas.some((o) => o.minutes > 15)).toBe(true);
    });
  });
});

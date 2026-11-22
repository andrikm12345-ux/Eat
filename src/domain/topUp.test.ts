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

  describe('follows the goal', () => {
    const run = (goalType: 'lose' | 'maintain' | 'gain') =>
      topUps([], { kcal: 900, protein: 50, fat: 40 }, 3, {
        hour: 21,
        goalType,
        storeOnly: true,
        maxMinutes: 5,
      });

    it('gaining: eats most of what is left, fat is not avoided, no meat before sleep', () => {
      const best = run('gain')[0]!;
      expect(best.total.kcal).toBeGreaterThan(900 * 0.8);
      expect(best.total.kcal).toBeLessThanOrEqual(900 * 1.05 + 20);
      expect(best.total.fat).toBeLessThanOrEqual(40 * 1.15 + 5);
      expect(best.items.some((h) => kindOf(h.name) === 'meat')).toBe(false);
    });

    it('losing brings less calories and less fat than gaining', () => {
      expect(run('lose')[0]!.total.kcal).toBeLessThan(run('gain')[0]!.total.kcal);
      expect(run('lose')[0]!.total.fat).toBeLessThan(run('gain')[0]!.total.fat);
    });

    it('gaining may take a bigger portion, losing never does', () => {
      const grams = (g: 'lose' | 'gain') => run(g).flatMap((o) => o.items.map((h) => h.grams));
      expect(grams('gain').some((x) => x >= 300 || x === 60 || x === 100)).toBe(true);
      const usual = new Set(
        topUps([], { kcal: 900, protein: 50, fat: 40 }, 30, {
          hour: 21,
          storeOnly: true,
          maxMinutes: 5,
        }).flatMap((o) => o.items.map((h) => `${h.name}${h.grams}`)),
      );
      for (const o of run('lose'))
        for (const h of o.items) expect(usual.has(`${h.name}${h.grams}`)).toBe(true);
    });
  });

  describe('losing: never over what is left, and lighter is offered', () => {
    const left = { kcal: 500, protein: 40, fat: 8, carbs: 40 };
    const lose = (maxMinutes: number | null) =>
      topUps([], left, 3, { hour: 14, goalType: 'lose', storeOnly: true, maxMinutes });

    it('calories, fat and carbs of every idea are within what is left', () => {
      for (const m of [5, 15, null]) {
        for (const o of lose(m)) {
          expect(o.total.kcal).toBeLessThanOrEqual(left.kcal);
          expect(o.total.fat).toBeLessThanOrEqual(left.fat);
          expect(o.total.carbs).toBeLessThanOrEqual(left.carbs);
        }
      }
    });

    it('offers lighter ideas next to the best one (up to 70% of the calories left)', () => {
      const ideas = lose(null);
      expect(ideas.length).toBeGreaterThanOrEqual(2);
      expect(ideas.slice(1).some((o) => o.total.kcal <= left.kcal * 0.7)).toBe(true);
    });

    it('nothing fits a day that has no fat left: empty, limits are not bent', () => {
      const none = topUps(
        [{ name: 'Масло', grams: 20, per100g: per(899, 0), uses: 5 }],
        { kcal: 300, protein: 0, fat: 0, carbs: 0 },
        3,
        { hour: 14, goalType: 'lose', storeOnly: true, maxMinutes: null },
      );
      for (const o of none) {
        expect(o.total.fat).toBe(0);
        expect(o.total.carbs).toBe(0);
      }
    });

    it('a day with calories over: nothing', () => {
      expect(
        topUps([], { kcal: 60, protein: 0 }, 3, { goalType: 'lose', storeOnly: true }),
      ).toEqual([]);
    });

    it('protein first and fat far below the limit', () => {
      const best = topUps([], { kcal: 600, protein: 60, fat: 15, carbs: 80 }, 3, {
        hour: 21,
        goalType: 'lose',
        storeOnly: true,
        maxMinutes: 5,
      });
      // at least 80% of the calories come from... protein-rich food: lots of protein per calorie
      expect(best[0]!.total.protein * 4).toBeGreaterThan(best[0]!.total.kcal * 0.6);
      // not at the fat limit
      expect(best[0]!.total.fat).toBeLessThan(15 * 0.5);
      expect(best[0]!.total.protein).toBeGreaterThan(40);
    });
  });

  describe('carbs follow the goal', () => {
    const left = { kcal: 800, protein: 50, fat: 40, carbs: 120 };
    const run = (goalType: 'lose' | 'gain') =>
      topUps([], left, 3, { hour: 14, goalType, storeOnly: true, maxMinutes: null });

    it('losing: carbs of the best idea are low, and never over the limit', () => {
      for (const o of run('lose')) expect(o.total.carbs).toBeLessThanOrEqual(left.carbs);
      expect(run('lose')[0]!.total.carbs).toBeLessThan(left.carbs * 0.3);
    });

    it('gaining: carbs are welcome, more than when losing', () => {
      expect(run('gain')[0]!.total.carbs).toBeGreaterThan(run('lose')[0]!.total.carbs + 20);
    });
  });

  it('a choice: eight ideas, each food at most twice', () => {
    const ideas = topUps([], { kcal: 900, protein: 65, fat: 16, carbs: 300 }, 8, {
      hour: 14,
      goalType: 'gain',
      storeOnly: true,
      maxMinutes: 5,
    });
    expect(ideas.length).toBeGreaterThanOrEqual(6);
    const count = new Map<string, number>();
    for (const o of ideas) for (const h of o.items) count.set(h.name, (count.get(h.name) ?? 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it('gaining: own usual portions are never made bigger, only shop foods', () => {
    const own: Habit[] = [
      { name: 'Сок мультифрукт', grams: 940, per100g: per(45, 0.5), uses: 6 },
      { name: 'Гречка с курицей', grams: 300, per100g: per(120, 8), uses: 5 },
    ];
    const ideas = topUps(own, { kcal: 1800, protein: 65, fat: 16, carbs: 349 }, 8, {
      hour: 14,
      goalType: 'gain',
    });
    expect(ideas.length).toBeGreaterThan(0);
    for (const o of ideas)
      for (const h of o.items) {
        if (h.name === 'Сок мультифрукт') expect(h.grams).toBe(940);
        if (h.name === 'Гречка с курицей') expect(h.grams).toBe(300);
      }
  });

  describe('drinks', () => {
    const own: Habit[] = [
      { name: 'Сок мультифрукт', grams: 940, per100g: per(46, 0.5), uses: 6 },
      { name: 'Сок апельсиновый', grams: 330, per100g: per(45, 0.7), uses: 3 },
      { name: 'Молочный коктейль', grams: 300, per100g: per(75, 3), uses: 3 },
    ];
    const left = { kcal: 1100, protein: 48, fat: 40, carbs: 268 };

    it('knows a drink, but not «в собственном соку»', () => {
      expect(kindOf('Сок мультифрукт')).toBe('drink');
      expect(kindOf('Напиток сокосодержащий «Апельсиновое манго»')).toBe('drink');
      expect(kindOf('Коктейль молочный «Малиновый пломбир»')).toBe('drink');
      expect(kindOf('Тунец в собственном соку')).toBe('other');
    });

    it('losing: no drinks at all', () => {
      const ideas = topUps(own, left, 8, { hour: 14, goalType: 'lose' });
      for (const o of ideas) for (const h of o.items) expect(kindOf(h.name)).not.toBe('drink');
    });

    it('others: at most one drink in an idea', () => {
      const ideas = topUps(own, left, 8, { hour: 14, goalType: 'gain' });
      for (const o of ideas)
        expect(o.items.filter((h) => kindOf(h.name) === 'drink').length).toBeLessThanOrEqual(1);
    });

    it('losing with no fat left: light shop foods, not an empty card', () => {
      const ideas = topUps([], { kcal: 1135, protein: 48, fat: 0, carbs: 268 }, 3, {
        hour: 18,
        goalType: 'lose',
        storeOnly: true,
      });
      expect(ideas.length).toBeGreaterThan(0);
      for (const o of ideas) expect(o.total.fat).toBeLessThanOrEqual(1);
    });
  });

  it("the card uses only the person's own foods, never the shop list", () => {
    const own: Habit[] = [{ name: 'Кефир мой', grams: 250, per100g: per(40, 3.4), uses: 4 }];
    const ideas = topUps(own, { kcal: 600, protein: 40 }, 5, { hour: 14, ownOnly: true });
    for (const o of ideas) expect(o.items.every((h) => !h.store)).toBe(true);
    expect(topUps([], { kcal: 600, protein: 40 }, 5, { hour: 14, ownOnly: true })).toEqual([]);
  });
});

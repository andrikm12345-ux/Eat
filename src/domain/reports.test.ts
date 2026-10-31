import { describe, expect, it } from 'vitest';
import { microReport } from './micros';
import { NUTRIENT_DEFS } from './nutrientDefs';
import { summarizeWeek, topSources } from './weekly';
import type { Entry, Goal } from './types';

describe('nutrient defs', () => {
  it('covers the required set with sex/age-specific norms', () => {
    const keys = NUTRIENT_DEFS.map((d) => d.key);
    for (const k of [
      'fiber',
      'sugar',
      'satFat',
      'sodium',
      'salt',
      'potassium',
      'calcium',
      'iron',
      'magnesium',
      'zinc',
      'vitA',
      'vitC',
      'vitD',
      'vitE',
      'vitK',
      'vitB1',
      'vitB2',
      'vitB3',
      'vitB6',
      'vitB9',
      'vitB12',
      'omega3',
    ]) {
      expect(keys).toContain(k);
    }
    const r = (key: string, sex: 'male' | 'female', age: number) =>
      NUTRIENT_DEFS.find((d) => d.key === key)!.rda(sex, age);
    expect([r('iron', 'female', 30), r('iron', 'female', 55), r('iron', 'male', 30)]).toEqual([
      18, 8, 8,
    ]);
    expect([
      r('fiber', 'male', 30),
      r('fiber', 'male', 60),
      r('fiber', 'female', 30),
      r('fiber', 'female', 60),
    ]).toEqual([38, 30, 25, 21]);
    expect([
      r('calcium', 'male', 30),
      r('calcium', 'female', 55),
      r('calcium', 'male', 75),
    ]).toEqual([1000, 1200, 1200]);
    expect([
      r('magnesium', 'male', 25),
      r('magnesium', 'male', 40),
      r('magnesium', 'female', 25),
      r('magnesium', 'female', 40),
    ]).toEqual([400, 420, 310, 320]);
    expect([r('vitD', 'female', 30), r('vitD', 'female', 80)]).toEqual([15, 20]);
    expect([r('vitB6', 'male', 30), r('vitB6', 'male', 60), r('vitB6', 'female', 60)]).toEqual([
      1.3, 1.7, 1.5,
    ]);
    expect([
      r('vitA', 'female', 30),
      r('sodium', 'male', 30),
      r('vitE', 'male', 30),
      r('vitB9', 'female', 30),
      r('vitB12', 'male', 30),
      r('salt', 'male', 1),
    ]).toEqual([700, 2300, 15, 400, 2.4, 5]);
  });
});

describe('microReport', () => {
  it('computes averages, ratios and kcal-weighted coverage', () => {
    // 3 days; iron known for 1500 of 2000 kcal (75 %), vitC known for 500 (25 %)
    const items = [
      { kcal: 1500, protein: 0, fat: 0, carbs: 0, iron: 12, sugar: 200 },
      { kcal: 500, protein: 0, fat: 0, carbs: 0, vitC: 90 },
    ];
    const rows = microReport(items, 3, 'female', 30);
    const iron = rows.find((r) => r.def.key === 'iron')!;
    expect(iron.avg).toBe(4);
    expect(iron.ratio).toBeCloseTo(4 / 18);
    expect(iron.coverage).toBe(0.75);
    expect(iron).toMatchObject({ lowData: false, deficit: true, above: false });
    const vitC = rows.find((r) => r.def.key === 'vitC')!;
    expect(vitC).toMatchObject({ coverage: 0.25, lowData: true, deficit: false });
    const sugar = rows.find((r) => r.def.key === 'sugar')!;
    expect(sugar.above).toBe(true); // coverage 75 %, avg 66.7 g > 50 g limit
  });
  it('flags limits and UL, handles empty data', () => {
    const rows = microReport(
      [{ kcal: 1000, protein: 0, fat: 0, carbs: 0, sugar: 120, zinc: 100 }],
      1,
      'male',
      30,
    );
    expect(rows.find((r) => r.def.key === 'sugar')!.above).toBe(true);
    expect(rows.find((r) => r.def.key === 'zinc')!.above).toBe(true);
    expect(rows.find((r) => r.def.key === 'potassium')!).toMatchObject({
      coverage: 0,
      lowData: true,
    });
    const empty = microReport([], 0, 'male', 30);
    expect(empty.every((r) => r.avg === 0 && r.coverage === 0)).toBe(true);
  });
});

const entry = (date: string, items: [string, number, number][]): Entry => ({
  id: date + items.length,
  date,
  time: '12:00',
  items: items.map(([name, kcal, protein]) => ({
    name,
    grams: 100,
    nutrients: { kcal, protein, fat: 0, carbs: 0 },
  })),
  totals: {
    kcal: items.reduce((s, i) => s + i[1], 0),
    protein: items.reduce((s, i) => s + i[2], 0),
    fat: 0,
    carbs: 0,
  },
  source: 'manual',
  createdAt: '',
  updatedAt: '',
});

describe('weekly', () => {
  const days = [
    '2026-03-02',
    '2026-03-03',
    '2026-03-04',
    '2026-03-05',
    '2026-03-06',
    '2026-03-07',
    '2026-03-08',
  ];
  const entries = [
    entry('2026-03-02', [
      ['Гречка', 300, 10],
      ['Курица', 200, 40],
    ]),
    entry('2026-03-03', [
      ['Гречка', 300, 10],
      ['Творог', 150, 25],
    ]),
  ];
  it('top sources', () => {
    expect(topSources(entries, 'kcal', 2)).toEqual([
      { name: 'Гречка', value: 600, share: 600 / 950 },
      { name: 'Курица', value: 200, share: 200 / 950 },
    ]);
    expect(topSources(entries, 'protein')[0]!.name).toBe('Курица');
    expect(topSources([], 'kcal')).toEqual([]);
    // Ties are sorted by name; zero totals give zero shares.
    const zero = [
      entry('2026-03-02', [
        ['Вода', 0, 0],
        ['Бульон', 0, 0],
      ]),
    ];
    expect(topSources(zero, 'kcal')).toEqual([
      { name: 'Бульон', value: 0, share: 0 },
      { name: 'Вода', value: 0, share: 0 },
    ]);
  });
  it('averages over logged days and that-day goals', () => {
    const goal = (validFrom: string, kcal: number): Goal => ({
      id: validFrom,
      validFrom,
      type: 'lose',
      rateKgPerWeek: -0.5,
      kcal,
      protein: 150,
      fat: 60,
      carbs: 200,
      source: 'manual',
      createdAt: validFrom,
      updatedAt: '',
    });
    const s = summarizeWeek(days, entries, [goal('2026-01-01', 2000), goal('2026-03-05', 1800)]);
    expect(s.loggedDays).toBe(2);
    expect(s.avg).toMatchObject({ kcal: 475, protein: 42.5 });
    expect(s.goalAvg!.kcal).toBeCloseTo((3 * 2000 + 4 * 1800) / 7);
    expect(s.goalAvg!.fiber).toBe(0);
    expect(summarizeWeek(days, [], []).goalAvg).toBeNull();
    expect(summarizeWeek(days, [], []).avg.kcal).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { goalFor } from './goals';

const g = (
  validFrom: string,
  kcal: number,
  createdAt = '2026-01-01T00:00:00Z',
  deletedAt?: string,
) => ({
  validFrom,
  kcal,
  createdAt,
  deletedAt,
});

describe('goalFor', () => {
  const goals = [g('2026-03-10', 1900), g('2026-03-01', 2200), g('2026-03-20', 2000)];

  it('picks the latest validFrom ≤ date', () => {
    expect(goalFor(goals, '2026-02-28')).toBeUndefined();
    expect(goalFor(goals, '2026-03-01')?.kcal).toBe(2200);
    expect(goalFor(goals, '2026-03-15')?.kcal).toBe(1900);
    expect(goalFor(goals, '2026-04-01')?.kcal).toBe(2000);
  });

  it('a goal change on the 10th does not affect the 9th', () => {
    expect(goalFor(goals, '2026-03-09')?.kcal).toBe(2200);
    expect(goalFor(goals, '2026-03-10')?.kcal).toBe(1900);
  });

  it('ignores deleted goals and breaks ties by createdAt', () => {
    const list = [
      g('2026-03-01', 2200, '2026-03-01T08:00:00Z'),
      g('2026-03-01', 2100, '2026-03-01T09:00:00Z'),
      g('2026-03-01', 2000, '2026-03-01T07:00:00Z'),
      g('2026-03-05', 1500, '2026-03-05T07:00:00Z', '2026-03-05T08:00:00Z'),
    ];
    expect(goalFor(list, '2026-03-06')?.kcal).toBe(2100);
  });
});

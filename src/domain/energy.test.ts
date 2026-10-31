import { describe, expect, it } from 'vitest';
import { bmrKatch, bmrMifflin, PAL, startingTdee, wizardBmr } from './energy';

describe('energy', () => {
  it('Mifflin-St Jeor', () => {
    // 10·80 + 6.25·180 − 5·30 + 5 = 1780
    expect(bmrMifflin({ sex: 'male', kg: 80, heightCm: 180, age: 30 })).toBe(1780);
    // 10·60 + 6.25·165 − 5·40 − 161 = 1270.25
    expect(bmrMifflin({ sex: 'female', kg: 60, heightCm: 165, age: 40 })).toBeCloseTo(1270.25);
  });

  it('Katch-McArdle', () => {
    expect(bmrKatch(64)).toBeCloseTo(370 + 21.6 * 64);
  });

  it('wizard BMR averages Mifflin and Katch only with a fresh body-fat value', () => {
    const base = { sex: 'male' as const, kg: 80, heightCm: 180, age: 30 };
    const katch = bmrKatch(80 * 0.8);
    expect(wizardBmr(base)).toBe(1780);
    expect(wizardBmr({ ...base, bodyFat: null })).toBe(1780);
    expect(wizardBmr({ ...base, bodyFat: { pct: 20, ageDays: 10 } })).toBeCloseTo(
      (1780 + katch) / 2,
    );
    expect(wizardBmr({ ...base, bodyFat: { pct: 20, ageDays: 30 } })).toBeCloseTo(
      (1780 + katch) / 2,
    );
    expect(wizardBmr({ ...base, bodyFat: { pct: 20, ageDays: 31 } })).toBe(1780);
    expect(wizardBmr({ ...base, bodyFat: { pct: 20, ageDays: -1 } })).toBe(1780);
  });

  it('PAL levels and TDEE₀', () => {
    expect(PAL).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      high: 1.725,
      very_high: 1.9,
    });
    expect(startingTdee(1780, 'moderate')).toBeCloseTo(2759);
  });
});

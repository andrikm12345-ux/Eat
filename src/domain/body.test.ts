import { describe, expect, it } from 'vitest';
import { bmi, leanMass, navyBodyFat } from './body';

describe('navyBodyFat', () => {
  it('male formula', () => {
    const expected =
      495 / (1.0324 - 0.19077 * Math.log10(90 - 38) + 0.15456 * Math.log10(180)) - 450;
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 90 })).toBeCloseTo(
      expected,
    );
    expect(expected).toBeGreaterThan(15);
    expect(expected).toBeLessThan(25);
  });

  it('female formula needs hips', () => {
    const expected =
      495 / (1.29579 - 0.35004 * Math.log10(75 + 100 - 33) + 0.221 * Math.log10(165)) - 450;
    expect(
      navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75, hipsCm: 100 }),
    ).toBeCloseTo(expected);
    expect(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75 })).toBeNull();
  });

  it('returns null for missing or invalid input', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 180, waistCm: 90 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: null })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 0, neckCm: 38, waistCm: 90 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: NaN, neckCm: 38, waistCm: 90 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: -1, waistCm: 90 })).toBeNull();
    // log argument ≤ 0
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 40, waistCm: 40 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 45, waistCm: 40 })).toBeNull();
    expect(
      navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 200, waistCm: 60, hipsCm: 90 }),
    ).toBeNull();
    // Non-physical: density ≤ 0
    expect(navyBodyFat({ sex: 'male', heightCm: 1, neckCm: 1, waistCm: 1e9 })).toBeNull();
  });

  it('clamps to 3–60 %', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 200, neckCm: 50, waistCm: 55 })).toBe(3);
    expect(navyBodyFat({ sex: 'male', heightCm: 150, neckCm: 30, waistCm: 200 })).toBe(60);
  });
});

describe('body helpers', () => {
  it('lean mass and BMI', () => {
    expect(leanMass(80, 20)).toBeCloseTo(64);
    expect(bmi(80, 200)).toBeCloseTo(20);
  });
});

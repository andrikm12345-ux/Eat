import { BODY_FAT_MAX, BODY_FAT_MIN } from './body';
import type { ActivityLevel, Sex } from './types';

/** Physical activity level multipliers. */
export const PAL: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

/** Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + (male ? 5 : −161). */
export function bmrMifflin(p: { sex: Sex; kg: number; heightCm: number; age: number }): number {
  return 10 * p.kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** Katch-McArdle: 370 + 21.6·LBM(kg). */
export function bmrKatch(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

/** Max age of a body-fat estimate that still counts as "fresh" for BMR. */
export const FRESH_BODY_FAT_DAYS = 30;

/**
 * BMR used by the goal wizard: Mifflin, or the mean of Mifflin and Katch-McArdle
 * when a body-fat estimate no older than 30 days is known.
 */
export function wizardBmr(p: {
  sex: Sex;
  kg: number;
  heightCm: number;
  age: number;
  bodyFat?: { pct: number; ageDays: number } | null;
}): number {
  const mifflin = bmrMifflin(p);
  const bf = p.bodyFat;
  if (!bf || bf.ageDays > FRESH_BODY_FAT_DAYS || bf.ageDays < 0) return mifflin;
  // A body fat below the essential minimum (or above 60 %) is a mistake in the measurements: it
  // must not move the metabolic rate (a 3 % estimate once added about 300 kcal).
  if (!(bf.pct >= BODY_FAT_MIN[p.sex] && bf.pct <= BODY_FAT_MAX)) return mifflin;
  const katch = bmrKatch(p.kg * (1 - bf.pct / 100));
  return (mifflin + katch) / 2;
}

/** Starting TDEE₀ = BMR × PAL. */
export function startingTdee(bmr: number, activity: ActivityLevel): number {
  return bmr * PAL[activity];
}

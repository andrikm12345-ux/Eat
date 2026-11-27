import type { Sex } from './types';

/**
 * An estimate outside this range is a mistake in the measurements, not a result: below the
 * essential fat (women about 10 %, men about 4 %) or above 60 %.
 */
export const BODY_FAT_MIN: Record<Sex, number> = { female: 10, male: 4 };
export const BODY_FAT_MAX = 60;

/**
 * US Navy body-fat estimate (all lengths in cm). Returns `null` when inputs are
 * missing/invalid, a logarithm argument is ≤ 0, or the result is outside 10–60 % for women and
 * 4–60 % for men (an absurd
 * measurement must not turn into a believable number: it used to be clamped to 3 %, and that
 * "lean" figure then drove the protein target up).
 */
export function navyBodyFat(p: {
  sex: Sex;
  heightCm: number;
  neckCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
}): number | null {
  const { sex, heightCm, neckCm, waistCm, hipsCm } = p;
  if (!isPositive(heightCm) || !isPositive(neckCm) || !isPositive(waistCm)) return null;
  let density: number;
  if (sex === 'male') {
    const arg = waistCm - neckCm;
    if (arg <= 0) return null;
    density = 1.0324 - 0.19077 * Math.log10(arg) + 0.15456 * Math.log10(heightCm);
  } else {
    if (!isPositive(hipsCm)) return null;
    const arg = waistCm + hipsCm - neckCm;
    if (arg <= 0) return null;
    density = 1.29579 - 0.35004 * Math.log10(arg) + 0.221 * Math.log10(heightCm);
  }
  // Non-physical input (e.g. absurd circumferences) can push density to ≤ 0.
  if (density <= 0) return null;
  const pct = 495 / density - 450;
  return pct >= BODY_FAT_MIN[sex] && pct <= BODY_FAT_MAX ? pct : null;
}

/** Lean body mass = weight × (1 − fat%). */
export function leanMass(kg: number, bodyFatPct: number): number {
  return kg * (1 - bodyFatPct / 100);
}

/** Body-mass index (reference only). */
export function bmi(kg: number, heightCm: number): number {
  const m = heightCm / 100;
  return kg / (m * m);
}

function isPositive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

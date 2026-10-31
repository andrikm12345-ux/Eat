import type { Sex } from './types';

export const BODY_FAT_MIN = 3;
export const BODY_FAT_MAX = 60;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * US Navy body-fat estimate (all lengths in cm). Returns `null` when inputs are
 * missing/invalid or a logarithm argument is ≤ 0. Result is clamped to 3–60 %.
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
  return clamp(495 / density - 450, BODY_FAT_MIN, BODY_FAT_MAX);
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

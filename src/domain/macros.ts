import type { GoalType } from './types';

/** Protein targets in g per kg of reference body weight. */
export const PROTEIN_PER_KG: Record<GoalType, { def: number; min: number; max: number }> = {
  lose: { def: 2.0, min: 1.8, max: 2.4 },
  maintain: { def: 1.8, min: 1.6, max: 2.2 },
  gain: { def: 1.8, min: 1.6, max: 2.2 },
};
/** Protein range in g per kg of lean body mass while losing. */
export const PROTEIN_PER_KG_LBM = { min: 2.3, max: 3.1 };

export const FAT_MIN_PER_KG = 0.6;
export const FAT_MIN_SHARE = 0.2;
export const FAT_DEFAULT_SHARE = 0.25;
export const FAT_MAX_SHARE = 0.35;
export const MIN_CARBS_G = 50;
export const FIBER_PER_1000_KCAL = 14;
export const WATER_ML_PER_KG = { min: 30, max: 35 };
/** BMI above which only a part of the excess weight counts for the g/kg rules. */
export const ADJUSTED_WEIGHT_BMI = 25;
/** Share of the weight above BMI 25 that counts (smooth: no jump at any BMI). */
export const EXCESS_WEIGHT_SHARE = 0.4;
/** Protein is at most this share of calories (it also keeps carbs and fat from being squeezed). */
export const PROTEIN_MAX_SHARE = 0.3;
/** ...but never below this many g per kg of reference weight. */
export const PROTEIN_FLOOR_PER_KG = 1.2;
/** A lean mass that implies less fat than this is a mistake in the input: it is ignored. */
export const MIN_PLAUSIBLE_BODY_FAT = 8;
export const MAX_PLAUSIBLE_BODY_FAT = 60;

export type MacroWarning =
  /** Carbs remainder was < 50 g: fat was lowered to its minimum, then protein. */
  | 'lowCarbs'
  /** Even minimum fat and protein exceed the calorie target; carbs set to 0. */
  | 'kcalBelowMacroMinimum';

export type MacroInput = {
  kcal: number;
  weightKg: number;
  heightCm: number;
  goalType: GoalType;
  /** Lean body mass, if a body-fat estimate is known. */
  leanMassKg?: number | null;
  /** Override for protein g/kg of reference weight (clamped to the goal's range). */
  proteinPerKg?: number;
  /** Fat share of calories (clamped to 20–35 %). Default 25 %. */
  fatShare?: number;
};

export type MacroResult = {
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  /** Suggested water, rounded to 50 ml (reference only). */
  waterMl: number;
  waterRangeMl: [number, number];
  /** Weight used for g/kg rules (adjusted when BMI > 30). */
  referenceWeightKg: number;
  proteinRange: [number, number];
  warnings: MacroWarning[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round50 = (v: number) => Math.round(v / 50) * 50;

/**
 * Weight for the g/kg rules: the actual weight up to BMI 25; above it the excess counts only
 * 40 % (fat tissue needs far less protein than muscle). Continuous: no jump at BMI 25 or 30.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  const edge = ADJUSTED_WEIGHT_BMI * m * m;
  if (weightKg <= edge) return weightKg;
  return edge + EXCESS_WEIGHT_SHARE * (weightKg - edge);
}

/**
 * Splits a calorie target into protein / fat / carbs (grams, integers).
 * Protein by goal and weight, at most 30 % of calories; fat ≥ 0.6 g/kg and ≥ 20 % kcal (default 25 %);
 * carbs are the remainder. If the remainder is < 50 g, fat drops to its minimum,
 * then protein to the low end of its range.
 */
export function computeMacros(input: MacroInput): MacroResult {
  const { kcal, weightKg, heightCm, goalType } = input;
  const refKg = referenceWeight(weightKg, heightCm);
  const rule = PROTEIN_PER_KG[goalType];
  // A lean mass that implies an impossible body fat (a mistake in the measurements) is ignored.
  const impliedFat = input.leanMassKg ? (1 - input.leanMassKg / weightKg) * 100 : null;
  const lbm =
    input.leanMassKg &&
    input.leanMassKg > 0 &&
    impliedFat !== null &&
    impliedFat >= MIN_PLAUSIBLE_BODY_FAT &&
    impliedFat <= MAX_PLAUSIBLE_BODY_FAT
      ? input.leanMassKg
      : null;

  let proteinLo = rule.min * refKg;
  let proteinHi = rule.max * refKg;
  if (goalType === 'lose' && lbm) {
    proteinLo = PROTEIN_PER_KG_LBM.min * lbm;
    proteinHi = PROTEIN_PER_KG_LBM.max * lbm;
  }
  const perKg = input.proteinPerKg ?? rule.def;
  // The g/kg default is kept, but forced into the active (LBM or weight) range.
  // Too much protein squeezes everything else: at most 30 % of calories (but never below 1.2 g/kg).
  const proteinCap = Math.max(
    Math.floor((PROTEIN_MAX_SHARE * kcal) / 4),
    Math.round(PROTEIN_FLOOR_PER_KG * refKg),
  );
  proteinHi = Math.min(proteinHi, proteinCap);
  proteinLo = Math.min(proteinLo, proteinHi);
  let protein = Math.round(clamp(perKg * refKg, proteinLo, proteinHi));
  const proteinMin = Math.round(proteinLo);

  const fatMin = Math.round(Math.max(FAT_MIN_PER_KG * refKg, (FAT_MIN_SHARE * kcal) / 9));
  const share = clamp(input.fatShare ?? FAT_DEFAULT_SHARE, FAT_MIN_SHARE, FAT_MAX_SHARE);
  let fat = Math.max(Math.round((share * kcal) / 9), fatMin);

  const carbsFor = () => (kcal - 4 * protein - 9 * fat) / 4;
  const warnings: MacroWarning[] = [];
  let carbs = carbsFor();
  if (carbs < MIN_CARBS_G) {
    warnings.push('lowCarbs');
    fat = fatMin;
    carbs = carbsFor();
    if (carbs < MIN_CARBS_G) {
      protein = proteinMin;
      carbs = carbsFor();
    }
    if (carbs < 0) {
      warnings.push('kcalBelowMacroMinimum');
      carbs = 0;
    }
  }

  return {
    protein,
    fat,
    carbs: Math.round(carbs),
    fiber: Math.round((FIBER_PER_1000_KCAL * kcal) / 1000),
    waterMl: round50(((WATER_ML_PER_KG.min + WATER_ML_PER_KG.max) / 2) * weightKg),
    waterRangeMl: [
      round50(WATER_ML_PER_KG.min * weightKg),
      round50(WATER_ML_PER_KG.max * weightKg),
    ],
    referenceWeightKg: refKg,
    proteinRange: [proteinMin, Math.round(proteinHi)],
    warnings,
  };
}

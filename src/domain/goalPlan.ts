import { bmi } from './body';
import { ageOn } from './dates';
import { startingTdee, wizardBmr } from './energy';
import { computeMacros, type MacroResult } from './macros';
import type { ActivityLevel, GoalType, LocalDate, Sex } from './types';

export const KCAL_PER_KG = 7700;
export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
export const GAIN_MAX_SURPLUS = 500;
export const UNDERWEIGHT_BMI = 18.5;

/** Weekly rate as % of body weight. */
export const RATE_PCT = {
  lose: { def: 0.5, min: 0.25, max: 1.0, presets: [0.25, 0.5, 0.75, 1.0] },
  gain: { def: 0.25, min: 0.1, max: 0.5, presets: [0.25, 0.5] },
} as const;

export type RateWarning =
  /** Losing faster than 1 % of body weight per week. */
  | 'fastLoss'
  /** Gaining faster than 0.5 % per week. */
  | 'fastGain'
  /** Very slow rate, progress will be hard to see. */
  | 'slowRate'
  /** BMI < 18.5: weight-loss goal is blocked. */
  | 'underweightLose';

export type PlanWarning =
  RateWarning | 'floorApplied' | 'gainCapped' | 'targetDirection' | MacroResult['warnings'][number];

export const round10 = (v: number) => Math.round(v / 10) * 10;

/** Default kg/week for a goal (negative when losing). */
export function defaultRateKg(goalType: GoalType, weightKg: number): number {
  if (goalType === 'maintain') return 0;
  const pct = RATE_PCT[goalType].def;
  return round2(((goalType === 'lose' ? -1 : 1) * pct * weightKg) / 100);
}

/** kg/week for a % of body weight (sign from goal). */
export function rateFromPct(goalType: GoalType, pct: number, weightKg: number): number {
  if (goalType === 'maintain') return 0;
  return round2(((goalType === 'lose' ? -1 : 1) * pct * weightKg) / 100);
}

/** Rate as % of body weight per week (absolute value). */
export function rateToPct(rateKgPerWeek: number, weightKg: number): number {
  return (Math.abs(rateKgPerWeek) / weightKg) * 100;
}

/** Safety checks for a weekly rate. `blocked` means the goal must not be saved. */
export function checkRate(p: {
  goalType: GoalType;
  rateKgPerWeek: number;
  weightKg: number;
  heightCm: number;
}): { warnings: RateWarning[]; blocked: boolean } {
  const warnings: RateWarning[] = [];
  if (p.goalType === 'maintain') return { warnings, blocked: false };
  if (p.goalType === 'lose' && bmi(p.weightKg, p.heightCm) < UNDERWEIGHT_BMI) {
    return { warnings: ['underweightLose'], blocked: true };
  }
  const pct = rateToPct(p.rateKgPerWeek, p.weightKg);
  const lim = RATE_PCT[p.goalType];
  if (pct > lim.max + 1e-9) warnings.push(p.goalType === 'lose' ? 'fastLoss' : 'fastGain');
  if (pct < lim.min - 1e-9) warnings.push('slowRate');
  return { warnings, blocked: false };
}

/** Minimum calorie target: max(BMR, 1200 ♀ / 1500 ♂). */
export function kcalFloor(sex: Sex, bmr: number): number {
  return Math.max(bmr, KCAL_FLOOR[sex]);
}

/**
 * Calorie target for a rate: round10(TDEE + rate·7700/7), not below the floor
 * and, when gaining, not above TDEE + 500.
 */
export function targetKcal(p: {
  tdee: number;
  rateKgPerWeek: number;
  goalType: GoalType;
  sex: Sex;
  bmr: number;
}): { kcal: number; floorApplied: boolean; gainCapped: boolean } {
  const rate = p.goalType === 'maintain' ? 0 : p.rateKgPerWeek;
  let kcal = round10(p.tdee + (rate * KCAL_PER_KG) / 7);
  let gainCapped = false;
  if (p.goalType === 'gain' && kcal > p.tdee + GAIN_MAX_SURPLUS) {
    kcal = round10(p.tdee + GAIN_MAX_SURPLUS);
    gainCapped = true;
  }
  const floor = Math.ceil(kcalFloor(p.sex, p.bmr) / 10) * 10;
  const floorApplied = kcal < floor;
  if (floorApplied) kcal = floor;
  return { kcal, floorApplied, gainCapped };
}

export type PlanInput = {
  sex: Sex;
  birthDate: LocalDate;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  rateKgPerWeek: number;
  targetWeightKg?: number | null;
  /** Fresh body-fat estimate, if any. */
  bodyFatPct?: number | null;
  today: LocalDate;
};

export type Plan = {
  age: number;
  bmr: number;
  tdee: number;
  kcal: number;
  macros: MacroResult;
  rateKgPerWeek: number;
  /** Weeks to reach the target at this rate, when computable. */
  weeksToTarget: number | null;
  warnings: PlanWarning[];
  blocked: boolean;
};

/** Full wizard calculation: BMR → TDEE₀ → calorie target → macros, with safety checks. */
export function planGoal(p: PlanInput): Plan {
  const age = ageOn(p.birthDate, p.today);
  const bf = p.bodyFatPct ?? null;
  const bmr = wizardBmr({
    sex: p.sex,
    kg: p.weightKg,
    heightCm: p.heightCm,
    age,
    bodyFat: bf === null ? null : { pct: bf, ageDays: 0 },
  });
  const tdee = startingTdee(bmr, p.activityLevel);
  const rate = p.goalType === 'maintain' ? 0 : p.rateKgPerWeek;
  const rateCheck = checkRate({ ...p, rateKgPerWeek: rate });
  const t = targetKcal({ tdee, rateKgPerWeek: rate, goalType: p.goalType, sex: p.sex, bmr });
  const macros = computeMacros({
    kcal: t.kcal,
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    goalType: p.goalType,
    leanMassKg: bf === null ? null : p.weightKg * (1 - bf / 100),
  });

  const warnings: PlanWarning[] = [...rateCheck.warnings];
  if (t.floorApplied) warnings.push('floorApplied');
  if (t.gainCapped) warnings.push('gainCapped');
  warnings.push(...macros.warnings);

  // When the surplus cap or the calorie floor kicked in, the pace the target really gives
  // differs from the requested one: report (and store) the real one.
  const effectiveRate =
    t.gainCapped || t.floorApplied ? round2(((t.kcal - tdee) * 7) / KCAL_PER_KG) : rate;

  let weeksToTarget: number | null = null;
  const target = p.targetWeightKg;
  if (target && target > 0 && p.goalType !== 'maintain') {
    const diff = target - p.weightKg;
    const wrongWay = (p.goalType === 'lose' && diff >= 0) || (p.goalType === 'gain' && diff <= 0);
    if (wrongWay) warnings.push('targetDirection');
    else if (effectiveRate !== 0) weeksToTarget = Math.ceil(Math.abs(diff / effectiveRate));
  }

  return {
    age,
    bmr,
    tdee,
    kcal: t.kcal,
    macros,
    rateKgPerWeek: effectiveRate,
    weeksToTarget,
    warnings,
    blocked: rateCheck.blocked,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

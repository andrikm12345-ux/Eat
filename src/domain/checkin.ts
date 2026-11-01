import { KCAL_PER_KG, kcalFloor, round10 } from './goalPlan';
import type { GoalType, Sex } from './types';

export const CHECKIN_MAX_WEEKLY_CHANGE = 200;

export type CheckinLimit = 'weeklyCap' | 'floor';

/**
 * Weekly proposal: round10(TDEE + rate·7700/7), changed by at most ±200 kcal vs the current
 * goal and never below max(BMR, 1200/1500). The pace itself is the user's choice.
 * Independent of whether past targets were met.
 */
export function proposeCheckin(p: {
  tdee: number;
  rateKgPerWeek: number;
  currentKcal: number;
  bmr: number;
  sex: Sex;
  goalType: GoalType;
}): { proposedKcal: number; rawKcal: number; limits: CheckinLimit[] } {
  const rate = p.goalType === 'maintain' ? 0 : p.rateKgPerWeek;
  const rawKcal = round10(p.tdee + (rate * KCAL_PER_KG) / 7);
  const limits: CheckinLimit[] = [];
  let kcal = rawKcal;
  const lo = p.currentKcal - CHECKIN_MAX_WEEKLY_CHANGE;
  const hi = p.currentKcal + CHECKIN_MAX_WEEKLY_CHANGE;
  if (kcal < lo || kcal > hi) {
    kcal = Math.min(hi, Math.max(lo, kcal));
    limits.push('weeklyCap');
  }
  const floor = kcalFloor(p.sex, p.bmr);
  if (kcal < floor) {
    kcal = floor;
    limits.push('floor');
  }
  // Round to 10 kcal; the floor rounds up so it is never undercut.
  const proposedKcal = limits.at(-1) === 'floor' ? Math.ceil(kcal / 10) * 10 : round10(kcal);
  return { proposedKcal, rawKcal, limits };
}

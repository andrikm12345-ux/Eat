import { ageOn } from '../domain/dates';
import { bmrMifflin, PAL } from '../domain/energy';
import { KCAL_PER_KG, planGoal } from '../domain/goalPlan';
import { computeMacros, PROTEIN_MAX_SHARE } from '../domain/macros';
import type { Goal, Weight } from '../domain/types';
import type { Repos } from '../db/repos';

/** A goal whose protein is above this share of its calories is checked (the rule is 30 %). */
const CHECK_SHARE = 0.33;
/** A stored target that implies a daily expenditure this much above Mifflin × activity is inflated. */
const INFLATED_RATIO = 1.1;

export type GoalFix = {
  id: string;
  wasKcal: number;
  nowKcal: number;
  was: number;
  now: number;
  /** Calories were recalculated from the wizard inputs (not only the protein). */
  recalculated: boolean;
};

const share = (g: Pick<Goal, 'protein' | 'kcal'>) => (g.kcal > 0 ? (4 * g.protein) / g.kcal : 0);

type Change = Partial<Pick<Goal, 'kcal' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'rateKgPerWeek'>>;

/**
 * Goals made by the wizard while a body-fat estimate from absurd measurements (3 % fat) was
 * in the calculation carry a metabolic rate (and so calories) that is far too high, and a protein
 * that is 40 % of them. This recalculates such goals once, from the same wizard inputs (sex,
 * age, height, the weight entered with the goal, activity, goal type and pace) with the scheme
 * now in force: Mifflin–St Jeor × activity, the pace of the goal, the calorie floor, protein at
 * most 30 % of calories. Then, for goals that are sound but have an overstated protein, only the
 * protein is corrected. A goal the person set by hand is left alone, unless it is a copy of an
 * automatic one (the same numbers: they only changed something else). Safe to run on every start
 * and after every sync: a corrected goal no longer matches.
 */
export async function fixOverstatedProtein(r: Repos): Promise<GoalFix[]> {
  const profile = await r.profile.get();
  const weights = (await r.weights.list())
    .filter((w) => !w.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!profile?.heightCm || !profile.birthDate || !profile.sex || weights.length === 0) return [];
  const goals = (await r.goals.list()).filter((g) => !g.deletedAt);
  const latest = [...weights]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .at(-1) as Weight;

  /** What this goal should become, or null when it is fine. */
  const fixOne = (g: Goal): Change | null => {
    // The weight entered with the goal: the first one saved on or after its start date.
    const w0 = weights.find((w) => w.date >= g.validFrom) ?? latest;
    const age = ageOn(profile.birthDate, g.validFrom);
    const rate = g.type === 'maintain' ? 0 : g.rateKgPerWeek;
    const base = {
      sex: profile.sex,
      kg: w0.kg,
      heightCm: profile.heightCm,
      age,
    };
    const mifflinTdee = bmrMifflin(base) * PAL[profile.activityLevel];
    const implied = g.kcal - (rate * KCAL_PER_KG) / 7;
    if (g.kcal > 0 && implied / mifflinTdee > INFLATED_RATIO) {
      const plan = planGoal({
        sex: profile.sex,
        birthDate: profile.birthDate,
        heightCm: profile.heightCm,
        weightKg: w0.kg,
        activityLevel: profile.activityLevel,
        goalType: g.type,
        rateKgPerWeek: g.rateKgPerWeek,
        targetWeightKg: g.targetWeightKg ?? null,
        bodyFatPct: null,
        today: g.validFrom,
      });
      if (!plan.blocked && plan.kcal < g.kcal) {
        return {
          kcal: plan.kcal,
          protein: plan.macros.protein,
          fat: plan.macros.fat,
          carbs: plan.macros.carbs,
          fiber: plan.macros.fiber,
          rateKgPerWeek: plan.rateKgPerWeek,
        };
      }
      // For a gain the inflated target is also too high: same replacement (it can be lower only).
    }
    if (share(g) > CHECK_SHARE) {
      const m = computeMacros({
        kcal: g.kcal,
        weightKg: latest.kg,
        heightCm: profile.heightCm,
        goalType: g.type,
      });
      if (
        m.protein < g.protein &&
        share({ protein: m.protein, kcal: g.kcal }) <= PROTEIN_MAX_SHARE + 0.05
      ) {
        return {
          protein: m.protein,
          carbs: Math.max(0, Math.round((g.kcal - 4 * m.protein - 9 * g.fat) / 4)),
        };
      }
    }
    return null;
  };

  const out: GoalFix[] = [];
  const apply = async (g: Goal, change: Change) => {
    await r.goals.update(g.id, change);
    out.push({
      id: g.id,
      wasKcal: g.kcal,
      nowKcal: change.kcal ?? g.kcal,
      was: g.protein,
      now: change.protein ?? g.protein,
      recalculated: change.kcal !== undefined,
    });
  };
  const automatic = goals.filter((g) => g.source !== 'manual');
  for (const g of automatic) {
    const change = fixOne(g);
    if (change) await apply(g, change);
  }
  // A hand-made goal that is a copy of an automatic one gets the same correction.
  for (const g of goals.filter((x) => x.source === 'manual')) {
    const parent = automatic.find((o) => o.protein === g.protein && o.kcal === g.kcal);
    if (!parent) continue;
    const change = fixOne(parent);
    if (change) await apply(g, change);
  }
  return out;
}

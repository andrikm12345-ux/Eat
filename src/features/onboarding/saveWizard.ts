import { navyBodyFat } from '../../domain/body';
import { toLocalTime } from '../../domain/dates';
import type { Plan } from '../../domain/goalPlan';
import type { ActivityLevel, GoalType, LocalDate, Profile, Sex } from '../../domain/types';
import type { Repos } from '../../db/repos';

export type WizardData = {
  sex: Sex;
  birthDate: LocalDate;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  rateKgPerWeek: number;
  targetWeightKg: number | null;
  neckCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
};

/**
 * Persists the wizard result: profile, weigh-in (if new/changed), measurements
 * (if given) and a new goal valid from `today`.
 */
export async function saveWizard(
  r: Repos,
  data: WizardData,
  plan: Plan,
  today: LocalDate,
  now: Date = new Date(),
): Promise<void> {
  const prev = await r.profile.get();
  const profile: Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
    sex: data.sex,
    birthDate: data.birthDate,
    heightCm: data.heightCm,
    activityLevel: data.activityLevel,
    exerciseCaloriesMode: prev?.exerciseCaloriesMode ?? 'none',
    weekStartsOn: 1,
    units: 'metric',
  };

  await r.db.transaction(
    'rw',
    [r.db.profile, r.db.weights, r.db.measurements, r.db.goals],
    async () => {
      await r.profile.save(profile);

      const latest = await r.weights.latest();
      if (!latest || latest.kg !== data.weightKg || latest.date !== today) {
        await r.weights.create({
          date: today,
          time: toLocalTime(now),
          kg: data.weightKg,
          source: 'manual',
        });
      }

      if (data.neckCm || data.waistCm || data.hipsCm) {
        const bf = navyBodyFat({
          sex: data.sex,
          heightCm: data.heightCm,
          neckCm: data.neckCm,
          waistCm: data.waistCm,
          hipsCm: data.hipsCm,
        });
        await r.measurements.create({
          date: today,
          ...(data.neckCm ? { neckCm: data.neckCm } : {}),
          ...(data.waistCm ? { waistCm: data.waistCm } : {}),
          ...(data.hipsCm ? { hipsCm: data.hipsCm } : {}),
          ...(bf !== null ? { bodyFatPct: bf, method: 'navy' as const } : {}),
        });
      }

      await r.goals.create({
        validFrom: today,
        type: data.goalType,
        rateKgPerWeek: plan.rateKgPerWeek,
        kcal: plan.kcal,
        protein: plan.macros.protein,
        fat: plan.macros.fat,
        carbs: plan.macros.carbs,
        fiber: plan.macros.fiber,
        waterMl: plan.macros.waterMl,
        ...(data.targetWeightKg ? { targetWeightKg: data.targetWeightKg } : {}),
        source: 'wizard',
      });
    },
  );
}

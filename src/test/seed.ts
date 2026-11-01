import { toLocalDate } from '../domain/dates';
import { repos } from '../db/repos';

/** Minimal onboarded state: profile + goal from 30 days ago + a weigh-in. */
export async function seedOnboarded() {
  const today = toLocalDate(new Date());
  await repos.profile.save({
    sex: 'male',
    birthDate: '1990-01-01',
    heightCm: 180,
    activityLevel: 'light',
    exerciseCaloriesMode: 'none',
    weekStartsOn: 1,
    units: 'metric',
  });
  await repos.goals.create({
    validFrom: '2020-01-01',
    type: 'lose',
    rateKgPerWeek: -0.4,
    kcal: 2200,
    protein: 160,
    fat: 61,
    carbs: 253,
    fiber: 31,
    waterMl: 2600,
    targetWeightKg: 74,
    source: 'wizard',
  });
  // 00:00 so that any weigh-in made during a test is later, whatever the time of day.
  await repos.weights.create({ date: today, time: '00:00', kg: 80, source: 'manual' });
}

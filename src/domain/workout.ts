import type { WorkoutExercise } from './types';

/** Common exercises offered as quick picks (bodyweight first). */
export const EXERCISE_PRESETS = [
  'Подтягивания',
  'Отжимания на брусьях',
  'Отжимания от пола',
  'Подъём ног на турнике',
  'Приседания',
  'Выпады',
  'Пресс',
  'Планка',
  'Жим лёжа',
  'Становая тяга',
  'Приседания со штангой',
  'Жим гантелей',
  'Подъём на бицепс',
] as const;

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** "Подтягивания 4×10 (+10 кг)". */
export function formatExercise(e: WorkoutExercise): string {
  const weight = e.weightKg ? ` (+${num(e.weightKg)} кг)` : '';
  return `${e.name} ${e.sets}×${e.reps}${weight}`;
}

/** All exercises in one line, or '' when there are none. */
export function formatExercises(list: WorkoutExercise[] | undefined): string {
  return (list ?? []).map(formatExercise).join(', ');
}

/** Total repetitions of a workout (all sets of all exercises). */
export function totalReps(list: WorkoutExercise[] | undefined): number {
  return (list ?? []).reduce((s, e) => s + e.sets * e.reps, 0);
}

/** Keeps only complete exercises: a name and positive sets and reps. */
export function cleanExercises(list: WorkoutExercise[]): WorkoutExercise[] {
  return list
    .map((e) => ({ ...e, name: e.name.trim() }))
    .filter((e) => e.name && e.sets > 0 && e.reps > 0)
    .map(({ weightKg, ...rest }) => (weightKg && weightKg > 0 ? { ...rest, weightKg } : rest));
}

/** Seconds one repetition takes (controlled tempo) and the usual rest between sets. */
export const REP_SECONDS = 4;
export const REST_SECONDS = 75;

/**
 * Session length implied by the exercises: every set takes reps × tempo, then a rest.
 * Rounded up to whole minutes, at least 5 when there is anything to do.
 */
export function estimateMinutes(list: WorkoutExercise[] | undefined): number {
  const ex = list ?? [];
  if (ex.length === 0) return 0;
  const seconds = ex.reduce((s, e) => s + e.sets * (e.reps * REP_SECONDS + REST_SECONDS), 0);
  return Math.max(5, Math.ceil(seconds / 60));
}

/**
 * How much extra load raises the effort: energy cost grows with the mass moved, so
 * the average added weight (weighted by repetitions) is compared with body weight.
 * 1 = bodyweight only, at most 1.5.
 */
export function loadFactor(bodyKg: number, list: WorkoutExercise[] | undefined): number {
  const ex = list ?? [];
  const reps = ex.reduce((s, e) => s + e.sets * e.reps, 0);
  if (reps === 0 || !(bodyKg > 0)) return 1;
  const extra = ex.reduce((s, e) => s + e.sets * e.reps * (e.weightKg ?? 0), 0) / reps;
  return Math.min(1.5, 1 + extra / bodyKg);
}

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

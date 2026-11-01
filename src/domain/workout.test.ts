import { describe, expect, it } from 'vitest';
import {
  cleanExercises,
  EXERCISE_PRESETS,
  formatExercise,
  formatExercises,
  totalReps,
} from './workout';

describe('workout exercises', () => {
  it('formats sets × reps and extra weight', () => {
    expect(formatExercise({ name: 'Подтягивания', sets: 4, reps: 10 })).toBe('Подтягивания 4×10');
    expect(formatExercise({ name: 'Брусья', sets: 3, reps: 8, weightKg: 7.5 })).toBe(
      'Брусья 3×8 (+7,5 кг)',
    );
    expect(
      formatExercises([
        { name: 'Подтягивания', sets: 4, reps: 10 },
        { name: 'Брусья', sets: 3, reps: 12 },
      ]),
    ).toBe('Подтягивания 4×10, Брусья 3×12');
    expect(formatExercises(undefined)).toBe('');
  });

  it('counts repetitions', () => {
    expect(
      totalReps([
        { name: 'a', sets: 4, reps: 10 },
        { name: 'b', sets: 3, reps: 12 },
      ]),
    ).toBe(76);
    expect(totalReps(undefined)).toBe(0);
  });

  it('drops incomplete rows and empty weights', () => {
    expect(
      cleanExercises([
        { name: ' Подтягивания ', sets: 4, reps: 10, weightKg: 0 },
        { name: '', sets: 3, reps: 10 },
        { name: 'Брусья', sets: 0, reps: 10 },
        { name: 'Пресс', sets: 3, reps: 0 },
        { name: 'Жим', sets: 3, reps: 5, weightKg: 60 },
      ]),
    ).toEqual([
      { name: 'Подтягивания', sets: 4, reps: 10 },
      { name: 'Жим', sets: 3, reps: 5, weightKg: 60 },
    ]);
  });

  it('offers bodyweight exercises first', () => {
    expect(EXERCISE_PRESETS.slice(0, 2)).toEqual(['Подтягивания', 'Отжимания на брусьях']);
  });
});

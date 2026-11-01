import { describe, expect, it } from 'vitest';
import {
  cleanExercises,
  estimateMinutes,
  EXERCISE_PRESETS,
  formatExercise,
  formatExercises,
  loadFactor,
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

  it('estimates the session length from sets, reps and rests', () => {
    expect(estimateMinutes(undefined)).toBe(0);
    expect(estimateMinutes([])).toBe(0);
    // 3 × (10 reps · 4 s + 75 s rest) = 345 s ≈ 6 min
    expect(estimateMinutes([{ name: 'a', sets: 3, reps: 10 }])).toBe(6);
    // Three such exercises: 1035 s ≈ 18 min
    expect(
      estimateMinutes([
        { name: 'a', sets: 3, reps: 10 },
        { name: 'b', sets: 3, reps: 10 },
        { name: 'c', sets: 3, reps: 10 },
      ]),
    ).toBe(18);
    // Never below five minutes.
    expect(estimateMinutes([{ name: 'a', sets: 1, reps: 1 }])).toBe(5);
  });

  it('extra weight raises the effort, bodyweight does not, capped at +50 %', () => {
    expect(loadFactor(70, undefined)).toBe(1);
    expect(loadFactor(70, [{ name: 'a', sets: 3, reps: 10 }])).toBe(1);
    expect(loadFactor(0, [{ name: 'a', sets: 3, reps: 10, weightKg: 10 }])).toBe(1);
    expect(loadFactor(70, [{ name: 'a', sets: 3, reps: 10, weightKg: 7 }])).toBeCloseTo(1.1);
    // Half of the reps with 14 kg, half without: average +7 kg.
    expect(
      loadFactor(70, [
        { name: 'a', sets: 3, reps: 10, weightKg: 14 },
        { name: 'b', sets: 3, reps: 10 },
      ]),
    ).toBeCloseTo(1.1);
    expect(loadFactor(60, [{ name: 'a', sets: 3, reps: 10, weightKg: 100 }])).toBe(1.5);
  });
});

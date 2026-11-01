export const MEALS = ['Завтрак', 'Обед', 'Ужин', 'Перекус'] as const;
export type Meal = (typeof MEALS)[number];

/** Meal that usually belongs to a time of day ("HH:MM"). */
export function mealByTime(time: string): Meal {
  const h = Number(time.slice(0, 2));
  if (h >= 5 && h < 11) return 'Завтрак';
  if (h >= 11 && h < 16) return 'Обед';
  if (h >= 17 && h < 22) return 'Ужин';
  return 'Перекус';
}

/** The AI's guess if it is one of the known meals, otherwise by time of day. */
export function initialMeal(guess: string | undefined, time: string): Meal {
  const g = MEALS.find((m) => m.toLowerCase() === guess?.trim().toLowerCase());
  return g ?? mealByTime(time);
}

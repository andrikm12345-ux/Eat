/** Compendium-style MET values for common activities (approximate). */
export const MET_TABLE = [
  { id: 'walk_slow', name: 'Ходьба, спокойно', met: 2.8 },
  { id: 'walk_brisk', name: 'Ходьба, быстрым шагом', met: 4.3 },
  { id: 'hiking', name: 'Поход, трекинг', met: 6.0 },
  { id: 'run_8', name: 'Бег, 8 км/ч', met: 8.3 },
  { id: 'run_10', name: 'Бег, 10 км/ч', met: 9.8 },
  { id: 'run_12', name: 'Бег, 12 км/ч', met: 11.8 },
  { id: 'cycle_easy', name: 'Велосипед, спокойно', met: 5.8 },
  { id: 'cycle_mod', name: 'Велосипед, умеренно', met: 8.0 },
  { id: 'cycle_stationary', name: 'Велотренажёр', met: 6.8 },
  { id: 'swim_easy', name: 'Плавание, спокойно', met: 6.0 },
  { id: 'swim_hard', name: 'Плавание, интенсивно', met: 9.8 },
  { id: 'calisthenics', name: 'Турник, брусья, воркаут', met: 3.8 },
  { id: 'calisthenics_hard', name: 'Воркаут интенсивно (круговая)', met: 8.0 },
  { id: 'strength_mod', name: 'Силовая тренировка', met: 5.0 },
  { id: 'strength_hard', name: 'Силовая, интенсивная', met: 6.0 },
  { id: 'crossfit', name: 'Кроссфит / круговая', met: 8.0 },
  { id: 'hiit', name: 'Интервальная (HIIT)', met: 8.0 },
  { id: 'yoga', name: 'Йога', met: 2.5 },
  { id: 'pilates', name: 'Пилатес', met: 3.0 },
  { id: 'stretching', name: 'Растяжка', met: 2.3 },
  { id: 'elliptical', name: 'Эллипсоид', met: 5.0 },
  { id: 'rowing', name: 'Гребной тренажёр', met: 7.0 },
  { id: 'stairs', name: 'Степпер / лестница', met: 8.8 },
  { id: 'jump_rope', name: 'Скакалка', met: 11.8 },
  { id: 'dance', name: 'Танцы', met: 5.0 },
  { id: 'aerobics', name: 'Аэробика', met: 7.3 },
  { id: 'football', name: 'Футбол', met: 7.0 },
  { id: 'basketball', name: 'Баскетбол', met: 6.5 },
  { id: 'volleyball', name: 'Волейбол', met: 4.0 },
  { id: 'tennis', name: 'Теннис', met: 7.3 },
  { id: 'table_tennis', name: 'Настольный теннис', met: 4.0 },
  { id: 'boxing', name: 'Бокс / единоборства', met: 9.0 },
  { id: 'ski_xc', name: 'Лыжи, беговые', met: 9.0 },
  { id: 'ski_alpine', name: 'Горные лыжи / сноуборд', met: 5.3 },
  { id: 'skating', name: 'Коньки / ролики', met: 7.0 },
  { id: 'climbing', name: 'Скалолазание', met: 8.0 },
  { id: 'gardening', name: 'Работа в саду', met: 3.8 },
  { id: 'housework', name: 'Уборка', met: 3.3 },
] as const;

export type MetId = (typeof MET_TABLE)[number]['id'];

/** kcal = MET × kg × hours. */
export function metKcal(met: number, kg: number, minutes: number): number {
  return met * kg * (minutes / 60);
}

export function findMet(nameOrId: string): (typeof MET_TABLE)[number] | undefined {
  const q = nameOrId.trim().toLowerCase();
  return MET_TABLE.find((m) => m.id === q || m.name.toLowerCase() === q);
}

/** Exercise calories added to the day's goal: none = 0 (default), half = 50 %, full = 100 %. */
export function exerciseBonus(mode: 'none' | 'half' | 'full', workoutKcal: number): number {
  if (mode === 'none' || !(workoutKcal > 0)) return 0;
  return mode === 'half' ? Math.round(workoutKcal * 0.5) : Math.round(workoutKcal);
}

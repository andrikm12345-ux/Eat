import { addDays } from './dates';

/** Context for achievement checks (computed from local data, goals per day). */
export type AchievementCtx = {
  userFoods: number;
  barcodeFoods: number;
  recipes: number;
  templates: number;
  entries: number;
  aiEntries: number;
  weighIns: number;
  measurements: number;
  progressPhotos: number;
  workouts: number;
  loggedDays: number;
  bestLogStreak: number;
  bestWeighStreak: number;
  /** Consecutive weeks with ≥ 1 measurement (best). */
  measureWeeksStreak: number;
  /** Best run of days with protein ≥ 90 % of that day's goal. */
  proteinRun: number;
  /** Best run of days with fiber ≥ that day's goal. */
  fiberRun: number;
  waterGoalDays: number;
  /** Progress toward the target weight by trend (0..1+), null without a target. */
  goalPath: number | null;
  tdeeExplained: boolean;
  acceptedCheckins: number;
  backups: number;
};

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  /** Progress 0..1 (1 = unlocked). For leveled achievements `level` is the reached step. */
  check: (c: AchievementCtx) => { progress: number; level?: number };
};

const ratio = (v: number, target: number) => ({ progress: Math.min(1, v / target) });
const PATH_STEP = 0.025;

/** Local catalog (~25). There is intentionally no achievement for low calorie intake. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_entry',
    title: 'Первая запись',
    description: 'Записать первый приём пищи',
    check: (c) => ratio(c.entries, 1),
  },
  {
    id: 'first_food',
    title: 'Свой продукт',
    description: 'Создать первый продукт',
    check: (c) => ratio(c.userFoods, 1),
  },
  {
    id: 'first_barcode',
    title: 'Сканер',
    description: 'Добавить продукт по штрихкоду',
    check: (c) => ratio(c.barcodeFoods, 1),
  },
  {
    id: 'first_recipe',
    title: 'Повар',
    description: 'Создать первый рецепт',
    check: (c) => ratio(c.recipes, 1),
  },
  {
    id: 'first_template',
    title: 'По шаблону',
    description: 'Сохранить первый шаблон',
    check: (c) => ratio(c.templates, 1),
  },
  {
    id: 'first_ai',
    title: 'С помощником',
    description: 'Записать еду с помощью ИИ',
    check: (c) => ratio(c.aiEntries, 1),
  },
  {
    id: 'first_weight',
    title: 'На весах',
    description: 'Первое взвешивание',
    check: (c) => ratio(c.weighIns, 1),
  },
  {
    id: 'first_measure',
    title: 'Сантиметр',
    description: 'Первый замер',
    check: (c) => ratio(c.measurements, 1),
  },
  {
    id: 'first_photo',
    title: 'Кадр',
    description: 'Первое фото прогресса',
    check: (c) => ratio(c.progressPhotos, 1),
  },
  {
    id: 'days_7',
    title: 'Неделя записей',
    description: '7 дней с записями',
    check: (c) => ratio(c.loggedDays, 7),
  },
  {
    id: 'days_30',
    title: 'Месяц записей',
    description: '30 дней с записями',
    check: (c) => ratio(c.loggedDays, 30),
  },
  {
    id: 'days_100',
    title: 'Сто дней',
    description: '100 дней с записями',
    check: (c) => ratio(c.loggedDays, 100),
  },
  {
    id: 'streak_7',
    title: 'Серия 7',
    description: '7 дней подряд с записями',
    check: (c) => ratio(c.bestLogStreak, 7),
  },
  {
    id: 'streak_30',
    title: 'Серия 30',
    description: '30 дней подряд с записями',
    check: (c) => ratio(c.bestLogStreak, 30),
  },
  {
    id: 'weigh_14',
    title: 'Регулярность',
    description: '14 дней подряд со взвешиванием',
    check: (c) => ratio(c.bestWeighStreak, 14),
  },
  {
    id: 'measure_4w',
    title: 'Четыре замера',
    description: '4 недели подряд с замерами',
    check: (c) => ratio(c.measureWeeksStreak, 4),
  },
  {
    id: 'protein_5',
    title: 'Белковая пятидневка',
    description: 'Белок ≥ 90 % цели 5 дней подряд',
    check: (c) => ratio(c.proteinRun, 5),
  },
  {
    id: 'fiber_week',
    title: 'Неделя клетчатки',
    description: 'Клетчатка не ниже цели 7 дней подряд',
    check: (c) => ratio(c.fiberRun, 7),
  },
  {
    id: 'water_7',
    title: 'Вода',
    description: '7 дней с выполненной целью по воде',
    check: (c) => ratio(c.waterGoalDays, 7),
  },
  {
    id: 'workouts_10',
    title: 'В движении',
    description: '10 тренировок',
    check: (c) => ratio(c.workouts, 10),
  },
  {
    id: 'path',
    title: 'Путь к цели',
    description: 'Каждые 2,5 % пути к целевому весу (по тренду)',
    check: (c) => {
      const level =
        c.goalPath === null
          ? 0
          : Math.max(0, Math.min(40, Math.floor((c.goalPath + 1e-9) / PATH_STEP)));
      return {
        progress: level > 0 ? 1 : c.goalPath === null ? 0 : Math.max(0, c.goalPath / PATH_STEP),
        level,
      };
    },
  },
  {
    id: 'goal_reached',
    title: 'Цель достигнута',
    description: 'Трендовый вес дошёл до цели',
    check: (c) => ({ progress: c.goalPath === null ? 0 : Math.max(0, Math.min(1, c.goalPath)) }),
  },
  {
    id: 'tdee_explained',
    title: 'Как это считается',
    description: 'Открыть объяснение расчёта расхода',
    check: (c) => ({ progress: c.tdeeExplained ? 1 : 0 }),
  },
  {
    id: 'checkins_4',
    title: 'Четыре пересчёта',
    description: 'Принять 4 еженедельных пересчёта',
    check: (c) => ratio(c.acceptedCheckins, 4),
  },
  {
    id: 'first_backup',
    title: 'Данные в безопасности',
    description: 'Сделать первую резервную копию',
    check: (c) => ratio(c.backups, 1),
  },
];

/** Longest run of consecutive days (sorted unique dates) satisfying the predicate. */
export function bestRun(days: readonly { date: string; ok: boolean }[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!d.ok) {
      run = 0;
      prev = d.date;
      continue;
    }
    run = prev !== null && addDays(prev, 1) === d.date && run > 0 ? run + 1 : 1;
    prev = d.date;
    best = Math.max(best, run);
  }
  return best;
}

import { addDays, ageOn, toLocalDate, weekDays } from '../domain/dates';
import { microReport, type MicroRow } from '../domain/micros';
import type { Nutrients, Workout } from '../domain/types';
import { summarizeWeek, topSources, type SourceRow, type WeekSummary } from '../domain/weekly';
import { computeTrend, pickDailyWeights, trendOn } from '../domain/weightTrend';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { goalFor } from '../domain/goals';

export type WeekReport = WeekSummary & {
  weekStart: string;
  trendStart: number | null;
  trendEnd: number | null;
  tdeeStart: number | null;
  tdeeEnd: number | null;
  tdeeConfidence: number | null;
  topKcal: SourceRow[];
  topProtein: SourceRow[];
  micros: MicroRow[];
  waterAvg: number;
  stepsAvg: number | null;
  workouts: { count: number; minutes: number; kcal: number };
  /** Calories of each day Mon–Sun with that day's goal, for the bars at the top. */
  dayKcal: { date: string; kcal: number; goal: number | null }[];
};

/** All numbers of the weekly review (Mon–Sun). Works fully offline, no AI. */
export async function loadWeekReport(r: Repos, weekStart: string): Promise<WeekReport> {
  const days = weekDays(weekStart);
  const from = days[0] as string;
  const to = days[6] as string;
  const [entries, goals, weights, metas, workouts, profile, tdee, alpha, pick] = await Promise.all([
    r.entries.inRange(from, to),
    r.goals.list(),
    r.weights.list(),
    r.db.dayMeta.where('date').between(from, to, true, true).toArray(),
    r.db.workouts.where('date').between(from, to, true, true).toArray(),
    r.profile.get(),
    r.db.tdeeHistory.where('date').between(addDays(from, -1), to, true, true).toArray(),
    r.settings.get(SETTINGS.trendAlpha.key, SETTINGS.trendAlpha.def),
    r.settings.get(SETTINGS.weightDailyPick.key, SETTINGS.weightDailyPick.def),
  ]);
  const summary = summarizeWeek(days, entries, goals);
  const trend = computeTrend(pickDailyWeights(weights, pick), alpha);
  const today = toLocalDate(new Date());
  const end = to < today ? to : today;
  const sortedTdee = tdee.sort((a, b) => a.date.localeCompare(b.date));
  const items: Nutrients[] = entries.flatMap((e) => e.items.map((i) => i.nutrients));
  const sex = profile?.sex ?? 'male';
  const age = profile ? ageOn(profile.birthDate, to) : 35;
  const liveMetas = metas.filter((m) => !m.deletedAt);
  const stepDays = liveMetas.filter((m) => typeof m.steps === 'number');
  const live: Workout[] = workouts.filter((w) => !w.deletedAt);
  return {
    ...summary,
    weekStart: from,
    trendStart: trendOn(trend, addDays(from, -1)) ?? trendOn(trend, from) ?? null,
    trendEnd: trendOn(trend, end) ?? null,
    tdeeStart: sortedTdee[0]?.tdee ?? null,
    tdeeEnd: sortedTdee.at(-1)?.tdee ?? null,
    tdeeConfidence: sortedTdee.at(-1)?.confidence ?? null,
    topKcal: topSources(entries, 'kcal'),
    topProtein: topSources(entries, 'protein'),
    micros: microReport(items, Math.max(1, summary.loggedDays), sex, age),
    waterAvg: liveMetas.reduce((s, m) => s + m.waterMl, 0) / 7,
    stepsAvg: stepDays.length
      ? stepDays.reduce((s, m) => s + (m.steps as number), 0) / stepDays.length
      : null,
    workouts: {
      count: live.length,
      minutes: live.reduce((s, w) => s + w.durationMin, 0),
      kcal: live.reduce((s, w) => s + (w.kcal ?? 0), 0),
    },
    dayKcal: days.map((d) => ({
      date: d,
      kcal: entries.filter((e) => e.date === d).reduce((s, e) => s + e.totals.kcal, 0),
      goal: goalFor(goals, d)?.kcal ?? null,
    })),
  };
}

const r0 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
const r1 = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Math.round(v * 10) / 10;

/** Aggregates only (no photos, no raw entries) for the weekly AI observations (prompt C). */
export function weeklyAggregates(w: WeekReport) {
  return {
    week: w.weekStart,
    daysLogged: w.loggedDays,
    averages: {
      kcal: r0(w.avg.kcal),
      protein: r0(w.avg.protein),
      fat: r0(w.avg.fat),
      carbs: r0(w.avg.carbs),
      fiber: r1(w.avg.fiber),
    },
    goals: w.goalAvg && {
      kcal: r0(w.goalAvg.kcal),
      protein: r0(w.goalAvg.protein),
      fat: r0(w.goalAvg.fat),
      carbs: r0(w.goalAvg.carbs),
      fiber: r0(w.goalAvg.fiber),
    },
    trendKg: { start: r1(w.trendStart), end: r1(w.trendEnd) },
    tdee: { start: r0(w.tdeeStart), end: r0(w.tdeeEnd), confidence: r1(w.tdeeConfidence) },
    topKcalSources: w.topKcal.map((s) => ({ name: s.name, kcal: r0(s.value) })),
    topProteinSources: w.topProtein.map((s) => ({ name: s.name, protein: r0(s.value) })),
    micronutrients: w.micros
      .filter((m) => m.deficit || m.above || m.lowData)
      .map((m) => ({
        name: m.def.name,
        percentOfNorm: Math.round(m.ratio * 100),
        coverage: Math.round(m.coverage * 100),
        status: m.lowData ? 'мало данных' : m.deficit ? 'ниже нормы' : 'выше лимита',
      })),
    waterMlAvg: r0(w.waterAvg),
    stepsAvg: r0(w.stepsAvg),
    workouts: w.workouts,
  };
}

export const insightsKey = (weekStart: string) => `weeklyInsights:${weekStart}`;

import {
  ACHIEVEMENTS,
  bestRun,
  type AchievementCtx,
  type AchievementDef,
} from '../domain/achievements';
import { daysBetween, weekStart } from '../domain/dates';
import { goalFor } from '../domain/goals';
import { goalProgress } from '../domain/progress';
import { computeStreak, type Streak } from '../domain/streaks';
import type { Goal, LocalDate } from '../domain/types';
import { computeTrend, pickDailyWeights, trendOn, type TrendPoint } from '../domain/weightTrend';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';

/** Start of the path toward the current target: trend when that target was first set. */
export function pathStart(
  goals: readonly Goal[],
  target: number,
  trend: readonly TrendPoint[],
): number | undefined {
  const first = [...goals]
    .filter((g) => !g.deletedAt && g.targetWeightKg === target)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
  if (!first) return undefined;
  return trendOn(trend, first.validFrom) ?? trend.find((p) => p.date >= first.validFrom)?.trend;
}

export async function loadStreaks(
  r: Repos,
  today: LocalDate,
): Promise<{ log: Streak; weigh: Streak }> {
  const [entries, metas, weights] = await Promise.all([
    r.entries.list(),
    r.db.dayMeta.toArray(),
    r.weights.list(),
  ]);
  const logDone = new Set([
    ...entries.map((e) => e.date),
    ...metas.filter((m) => m.intentionalSkip && !m.deletedAt).map((m) => m.date),
  ]);
  return {
    log: computeStreak(logDone, today),
    weigh: computeStreak(new Set(weights.map((w) => w.date)), today),
  };
}

export async function buildAchievementCtx(r: Repos, today: LocalDate): Promise<AchievementCtx> {
  const [
    foods,
    recipes,
    templates,
    entries,
    weights,
    measurements,
    blobs,
    workouts,
    metas,
    goals,
    checkins,
    explained,
    backups,
  ] = await Promise.all([
    r.foods.list(),
    r.recipes.list(),
    r.templates.list(),
    r.entries.list(),
    r.weights.list(),
    r.measurements.list(),
    r.blobs.list(),
    r.workouts.list(),
    r.db.dayMeta.toArray(),
    r.goals.list(),
    r.checkins.list(),
    r.settings.get(SETTINGS.tdeeExplained.key, SETTINGS.tdeeExplained.def),
    r.settings.get(SETTINGS.backupCount.key, SETTINGS.backupCount.def),
  ]);
  const streaks = await loadStreaks(r, today);
  const byDay = new Map<LocalDate, { protein: number; fiber: number }>();
  for (const e of entries) {
    const d = byDay.get(e.date) ?? { protein: 0, fiber: 0 };
    d.protein += e.totals.protein;
    d.fiber += e.totals.fiber ?? 0;
    byDay.set(e.date, d);
  }
  const days = [...byDay.entries()];
  const goalOf = (d: LocalDate) => goalFor(goals, d);
  const measureWeeks = [...new Set(measurements.map((m) => weekStart(m.date)))].map((w) => ({
    date: w,
    ok: true,
  }));
  // Weeks are 7 days apart: map each week start to its index to reuse bestRun on days.
  const weekIdx = measureWeeks.map((w) => ({
    date: dayFromIndex(daysBetween('2000-01-03', w.date) / 7),
    ok: true,
  }));
  const trend = computeTrend(pickDailyWeights(weights));
  const goalToday = goalOf(today);
  let goalPath: number | null = null;
  const target = goalToday?.targetWeightKg;
  const now = trendOn(trend, today);
  if (target !== undefined && now !== undefined) {
    const start = pathStart(goals, target, trend);
    goalPath = start !== undefined ? goalProgress(start, now, target) : null;
  }
  const liveMetas = metas.filter((m) => !m.deletedAt);
  return {
    userFoods: foods.filter((f) => f.source === 'user' || f.source === 'ai_label').length,
    barcodeFoods:
      foods.filter((f) => f.source === 'off').length +
      entries.filter((e) => e.source === 'barcode').length,
    recipes: recipes.length,
    templates: templates.length,
    entries: entries.length,
    aiEntries: entries.filter((e) => e.source === 'ai_photo' || e.source === 'ai_text').length,
    weighIns: weights.length,
    measurements: measurements.length,
    progressPhotos: blobs.filter((b) => b.kind === 'progress').length,
    workouts: workouts.length,
    loggedDays: byDay.size,
    bestLogStreak: streaks.log.best,
    bestWeighStreak: streaks.weigh.best,
    measureWeeksStreak: bestRun(weekIdx),
    proteinRun: bestRun(
      days.map(([date, v]) => ({
        date,
        ok: !!goalOf(date) && v.protein >= 0.9 * (goalOf(date) as Goal).protein,
      })),
    ),
    fiberRun: bestRun(
      days.map(([date, v]) => ({
        date,
        ok: !!goalOf(date)?.fiber && v.fiber >= ((goalOf(date) as Goal).fiber as number),
      })),
    ),
    waterGoalDays: liveMetas.filter((m) => {
      const w = goalOf(m.date)?.waterMl;
      return !!w && m.waterMl >= w;
    }).length,
    goalPath,
    tdeeExplained: explained,
    acceptedCheckins: checkins.filter((c) => c.status === 'accepted').length,
    backups,
  };
}

/** Day string for an integer index (consecutive indices → consecutive days). */
function dayFromIndex(i: number): string {
  const d = new Date(2000, 0, 3 + Math.round(i));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type Unlock = { def: AchievementDef; level?: number };

/** Stores newly unlocked achievements (and new levels of leveled ones); returns them. */
export async function evaluateAchievements(r: Repos, today: LocalDate): Promise<Unlock[]> {
  const ctx = await buildAchievementCtx(r, today);
  const existing = new Map((await r.db.achievements.toArray()).map((a) => [a.id, a]));
  const out: Unlock[] = [];
  const now = new Date().toISOString();
  for (const def of ACHIEVEMENTS) {
    const res = def.check(ctx);
    const prev = existing.get(def.id);
    if (res.level !== undefined) {
      if (res.level > 0 && res.level > (prev?.progress ?? 0)) {
        await r.db.achievements.put({
          id: def.id,
          unlockedAt: prev?.unlockedAt ?? now,
          progress: res.level,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        });
        out.push({ def, level: res.level });
      }
      continue;
    }
    if (res.progress >= 1 && !prev) {
      await r.db.achievements.put({
        id: def.id,
        unlockedAt: now,
        progress: 1,
        createdAt: now,
        updatedAt: now,
      });
      out.push({ def });
    }
  }
  return out;
}

/** Number shown on the app icon (Badging API) or null to clear. */
export async function badgeValue(r: Repos, today: LocalDate): Promise<number | null> {
  const mode = await r.settings.get(SETTINGS.badgeMode.key, SETTINGS.badgeMode.def);
  if (mode === 'protein') {
    const [goal, entries] = await Promise.all([r.goals.goalFor(today), r.entries.byDate(today)]);
    if (!goal) return null;
    const left = Math.round(goal.protein - entries.reduce((s, e) => s + e.totals.protein, 0));
    return left > 0 ? left : null;
  }
  if (mode === 'weigh') {
    const last = await r.weights.latest();
    if (!last) return null;
    const days = daysBetween(last.date, today);
    return days > 0 ? days : null;
  }
  return null;
}

export async function applyBadge(value: number | null): Promise<boolean> {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (value === null) await nav.clearAppBadge?.();
    else await nav.setAppBadge?.(value);
    return typeof nav.setAppBadge === 'function';
  } catch {
    return false;
  }
}

import { ageOn, daysBetween, parseLocalDate, weekStart } from '../domain/dates';
import { proposeCheckin } from '../domain/checkin';
import { bmrMifflin, startingTdee } from '../domain/energy';
import { computeMacros } from '../domain/macros';
import {
  computeTdeeSeries,
  regimeStartsFromGoals,
  type DayInput,
  type TdeeRow,
} from '../domain/tdee';
import type { Checkin, LocalDate, Profile } from '../domain/types';
import { computeTrend, pickDailyWeights, trendOn } from '../domain/weightTrend';
import { trendRatePerWeek } from '../domain/progress';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';
import { formatKcal, formatRate } from '../domain/format';

export type TdeeState = {
  rows: TdeeRow[];
  last: TdeeRow | null;
  bmr: number;
  profile: Profile;
};

/** Recomputes the whole TDEE history from all local data and stores it. */
export async function recomputeTdee(r: Repos, today: LocalDate): Promise<TdeeState | null> {
  const [profile, goals, entries, metas, weights, alpha, pick, windowDays, rho] = await Promise.all(
    [
      r.profile.get(),
      r.goals.list(),
      r.entries.list(),
      r.db.dayMeta.toArray(),
      r.weights.list(),
      r.settings.get(SETTINGS.trendAlpha.key, SETTINGS.trendAlpha.def),
      r.settings.get(SETTINGS.weightDailyPick.key, SETTINGS.weightDailyPick.def),
      r.settings.get(SETTINGS.tdeeWindowDays.key, SETTINGS.tdeeWindowDays.def),
      r.settings.get(SETTINGS.tdeeRho.key, SETTINGS.tdeeRho.def),
    ],
  );
  if (!profile || goals.length === 0) return null;

  const daily = pickDailyWeights(weights, pick);
  const trend = computeTrend(daily, alpha);
  const firstGoal = [...goals].sort((a, b) =>
    a.validFrom.localeCompare(b.validFrom),
  )[0] as (typeof goals)[number];
  const start = [firstGoal.validFrom, daily[0]?.date ?? today].sort()[0] as LocalDate;
  if (start > today) return null;

  const kcal = new Map<LocalDate, number>();
  for (const e of entries) kcal.set(e.date, (kcal.get(e.date) ?? 0) + e.totals.kcal);
  const metaBy = new Map(metas.filter((m) => !m.deletedAt).map((m) => [m.date, m]));
  const days = new Map<LocalDate, DayInput>();
  for (const date of new Set([...kcal.keys(), ...metaBy.keys()])) {
    const m = metaBy.get(date);
    days.set(date, {
      kcal: kcal.get(date) ?? 0,
      complete: !!m?.complete,
      excluded: !!m?.excludeFromTdee,
    });
  }

  const startKg = trendOn(trend, start) ?? daily[0]?.kg ?? 70;
  const bmr = bmrMifflin({
    sex: profile.sex,
    kg: startKg,
    heightCm: profile.heightCm,
    age: ageOn(profile.birthDate, start),
  });
  const tdee0 = startingTdee(bmr, profile.activityLevel);
  const rows = computeTdeeSeries(
    {
      days,
      weights: new Map(daily.map((w) => [w.date, w.kg])),
      trend,
      start,
      tdee0,
      bmr,
      regimeStarts: regimeStartsFromGoals(goals),
    },
    today,
    { windowDays, rho },
  );

  await r.db.transaction('rw', r.db.tdeeHistory, async () => {
    await r.db.tdeeHistory.clear();
    const now = new Date().toISOString();
    await r.db.tdeeHistory.bulkPut(
      rows.map((x) => ({
        date: x.date,
        trendKg: x.trendKg,
        tdee: x.tdee,
        confidence: x.confidence,
        intakeAvg: x.intakeAvg,
        windowDays: x.windowDays,
        createdAt: now,
        updatedAt: now,
      })),
    );
  });
  const currentKg = trendOn(trend, today) ?? startKg;
  const bmrNow = bmrMifflin({
    sex: profile.sex,
    kg: currentKg,
    heightCm: profile.heightCm,
    age: ageOn(profile.birthDate, today),
  });
  return { rows, last: rows.at(-1) ?? null, bmr: bmrNow, profile };
}

const MIN_DAYS_FOR_CHECKIN = 14;

/** Monday-based weekday index (0 = Monday … 6 = Sunday). */
const monIndex = (d: LocalDate) => (parseLocalDate(d).getDay() + 6) % 7;

/**
 * Creates the weekly check-in (status `pending`) on/after the chosen weekday when there is
 * enough data and none exists for this week yet.
 */
export async function ensureCheckin(
  r: Repos,
  today: LocalDate,
  state: TdeeState | null,
): Promise<Checkin | null> {
  if (!state?.last || state.last.lowData || state.rows.length < MIN_DAYS_FOR_CHECKIN) return null;
  const weekday = await r.settings.get(SETTINGS.checkinWeekday.key, SETTINGS.checkinWeekday.def);
  if (monIndex(today) < (weekday + 6) % 7) return null;
  const ws = weekStart(today);
  const existing = await r.checkins.where('weekStart', ws);
  if (existing.length) return null;
  const goal = await r.goals.goalFor(today);
  if (!goal) return null;

  const weights = await r.weights.list();
  const trend = computeTrend(pickDailyWeights(weights));
  const ratePerWeek = trendRatePerWeek(trend, today, state.last.windowDays) ?? 0;
  const p = proposeCheckin({
    tdee: state.last.tdee,
    rateKgPerWeek: goal.rateKgPerWeek,
    currentKcal: goal.kcal,
    bmr: state.bmr,
    sex: state.profile.sex,
    goalType: goal.type,
  });
  const explanation = ru.checkin.explain({
    weeks: Math.round(state.last.windowDays / 7),
    intake: formatKcal(state.last.intakeAvg),
    trend: formatRate(ratePerWeek),
    tdee: formatKcal(state.last.tdee),
    rate: formatRate(goal.type === 'maintain' ? 0 : goal.rateKgPerWeek),
    proposed: formatKcal(p.proposedKcal),
    limits: p.limits,
  });
  return r.checkins.create({
    weekStart: ws,
    proposedKcal: p.proposedKcal,
    tdee: state.last.tdee,
    trendDeltaKgPerWeek: ratePerWeek,
    status: 'pending',
    explanation,
  });
}

/** Accepts a check-in: new goal from today with macros for the new calories. */
export async function acceptCheckin(r: Repos, c: Checkin, kcal: number, today: LocalDate) {
  const [goal, profile, weights] = await Promise.all([
    r.goals.goalFor(today),
    r.profile.get(),
    r.weights.list(),
  ]);
  if (!goal || !profile) throw new Error('No goal/profile');
  const trend = computeTrend(pickDailyWeights(weights));
  const kg = trendOn(trend, today) ?? weights.at(-1)?.kg ?? 70;
  const lastBf = (await r.measurements.list())
    .filter((m) => m.bodyFatPct !== undefined && daysBetween(m.date, today) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.bodyFatPct;
  const m = computeMacros({
    kcal,
    weightKg: kg,
    heightCm: profile.heightCm,
    goalType: goal.type,
    leanMassKg: lastBf !== undefined ? kg * (1 - lastBf / 100) : null,
  });
  await r.db.transaction('rw', r.db.goals, r.db.checkins, async () => {
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = goal;
    await r.goals.create({
      ...rest,
      validFrom: today,
      kcal,
      protein: m.protein,
      fat: m.fat,
      carbs: m.carbs,
      fiber: m.fiber,
      source: 'checkin',
      note: undefined,
    });
    await r.checkins.update(c.id, { status: 'accepted', acceptedKcal: kcal });
  });
}

export async function skipCheckin(r: Repos, c: Checkin) {
  await r.checkins.update(c.id, { status: 'skipped' });
}

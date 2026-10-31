import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, bestRun, type AchievementCtx } from './achievements';
import { addDays } from './dates';
import { buildIcs, byDay, foldLine } from './ics';
import { computeStreak } from './streaks';

const set = (...d: string[]) => new Set(d);
const range = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));

describe('streaks', () => {
  it('counts consecutive days; today not done does not break', () => {
    expect(computeStreak(set(), '2026-03-10')).toEqual({ current: 0, best: 0, freezesUsed: 0 });
    expect(computeStreak(set(...range('2026-03-05', 5)), '2026-03-10').current).toBe(5);
    expect(computeStreak(set(...range('2026-03-05', 6)), '2026-03-10').current).toBe(6);
  });
  it('bridges up to 2 missed days per month with freezes', () => {
    const d = set('2026-03-01', '2026-03-02', '2026-03-04', '2026-03-06', '2026-03-07');
    expect(computeStreak(d, '2026-03-07')).toEqual({ current: 5, best: 5, freezesUsed: 2 });
    const third = set('2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07');
    expect(computeStreak(third, '2026-03-07')).toMatchObject({
      current: 1,
      best: 3,
      freezesUsed: 2,
    });
  });
  it('freezes reset each month; future dates ignored', () => {
    const d = set('2026-03-30', '2026-04-01', '2026-04-03', '2026-04-05');
    expect(computeStreak(d, '2026-04-05')).toMatchObject({ current: 4, freezesUsed: 2 });
    expect(computeStreak(set('2026-04-06'), '2026-04-05').current).toBe(0);
    expect(computeStreak(set('2026-03-01'), '2026-03-01', 0).current).toBe(1);
  });
});

describe('achievements', () => {
  const ctx: AchievementCtx = {
    userFoods: 0,
    barcodeFoods: 0,
    recipes: 0,
    templates: 0,
    entries: 0,
    aiEntries: 0,
    weighIns: 0,
    measurements: 0,
    progressPhotos: 0,
    workouts: 0,
    loggedDays: 0,
    bestLogStreak: 0,
    bestWeighStreak: 0,
    measureWeeksStreak: 0,
    proteinRun: 0,
    fiberRun: 0,
    waterGoalDays: 0,
    goalPath: null,
    tdeeExplained: false,
    acceptedCheckins: 0,
    backups: 0,
  };
  const check = (id: string, c: Partial<AchievementCtx>) =>
    ACHIEVEMENTS.find((a) => a.id === id)!.check({ ...ctx, ...c });

  it('has ~25 achievements and none about low calories', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(ACHIEVEMENTS.some((a) => /низк|минимальн.*кал/i.test(a.title + a.description))).toBe(
      false,
    );
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it('progress is clamped to 1', () => {
    for (const a of ACHIEVEMENTS) expect(a.check(ctx).progress).toBe(0);
    const full: AchievementCtx = {
      ...ctx,
      userFoods: 9,
      barcodeFoods: 9,
      recipes: 9,
      templates: 9,
      entries: 9,
      aiEntries: 9,
      weighIns: 9,
      measurements: 9,
      progressPhotos: 9,
      workouts: 99,
      loggedDays: 999,
      bestLogStreak: 99,
      bestWeighStreak: 99,
      measureWeeksStreak: 9,
      proteinRun: 9,
      fiberRun: 9,
      waterGoalDays: 9,
      goalPath: 1.2,
      tdeeExplained: true,
      acceptedCheckins: 9,
      backups: 1,
    };
    for (const a of ACHIEVEMENTS) expect(a.check(full).progress).toBe(1);
    expect(check('days_30', { loggedDays: 15 }).progress).toBe(0.5);
  });
  it('path levels every 2.5 %', () => {
    expect(check('path', { goalPath: 0.01 }).progress).toBeCloseTo(0.4);
    expect(check('path', { goalPath: 0.025 })).toEqual({ progress: 1, level: 1 });
    expect(check('path', { goalPath: 0.26 }).level).toBe(10);
    expect(check('path', { goalPath: 2 }).level).toBe(40);
    expect(check('path', { goalPath: -0.1 })).toEqual({ progress: 0, level: 0 });
    expect(check('goal_reached', { goalPath: -0.5 }).progress).toBe(0);
  });
  it('best run of consecutive ok days', () => {
    expect(
      bestRun([
        { date: '2026-03-01', ok: true },
        { date: '2026-03-02', ok: true },
        { date: '2026-03-03', ok: false },
        { date: '2026-03-04', ok: true },
        { date: '2026-03-06', ok: true },
        { date: '2026-03-07', ok: true },
        { date: '2026-03-08', ok: true },
      ]),
    ).toBe(3);
    expect(bestRun([])).toBe(0);
  });
});

describe('ics', () => {
  it('builds a valid calendar with recurring events and alarms', () => {
    const ics = buildIcs(
      [
        {
          uid: 'weigh@dnevnik',
          title: 'Взвешивание',
          description: 'Утром, натощак; после туалета',
          date: '2026-11-01',
          time: '07:30',
          rrule: 'FREQ=DAILY',
          alarmMin: 0,
        },
        {
          uid: 'review@dnevnik',
          title: 'Разбор недели',
          date: '2026-11-01',
          time: '23:55',
          durationMin: 15,
          rrule: `FREQ=WEEKLY;BYDAY=${byDay(0)}`,
        },
      ],
      '2026-10-31T08:00:00.000Z',
    );
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261101T073000');
    expect(ics).toContain('DTEND:20261101T074000');
    expect(ics).toContain('DTEND:20261101T001000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(ics).toContain('DTSTAMP:20261031T080000Z');
    expect(ics).toContain('DESCRIPTION:Утром\\, натощак\\; после туалета');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    const enc = new TextEncoder();
    for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(byDay(8)).toBe('MO');
  });
  it('folds long UTF-8 lines', () => {
    const long = 'SUMMARY:' + 'Очень длинное напоминание '.repeat(5);
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    expect(foldLine('SHORT')).toBe('SHORT');
  });
});

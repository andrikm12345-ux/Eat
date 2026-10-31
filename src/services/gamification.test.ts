import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addDays, toLocalDate } from '../domain/dates';
import { repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';
import { useUi } from '../state/ui';
import { renderApp } from '../test/renderApp';
import { badgeValue, buildAchievementCtx, evaluateAchievements, loadStreaks } from './gamification';
import { buildRemindersIcs, nextWeekday } from './ics';

const today = toLocalDate(new Date());

async function eat(date: string, protein: number) {
  await repos.entries.add({
    date,
    time: '12:00',
    items: [
      { name: 'Еда', grams: 0, nutrients: { kcal: 2000, protein, fat: 60, carbs: 200, fiber: 35 } },
    ],
    source: 'quick',
  });
}
const goal = (validFrom: string, protein: number) =>
  repos.goals.create({
    validFrom,
    type: 'lose',
    rateKgPerWeek: -0.5,
    kcal: 2000,
    protein,
    fat: 60,
    carbs: 200,
    fiber: 30,
    waterMl: 2000,
    targetWeightKg: 70,
    source: 'manual',
  });

describe('achievements use that day’s goal', () => {
  it('protein run: a later goal change does not re-judge earlier days', async () => {
    const start = addDays(today, -10);
    await goal(addDays(start, -30), 160);
    for (let i = 0; i < 5; i++) await eat(addDays(start, i), 150); // 150 ≥ 0.9 × 160
    let ctx = await buildAchievementCtx(repos, today);
    expect(ctx.proteinRun).toBe(5);
    // New, higher goal from day 4 → days 4–5 now judged against 200 → run 3.
    await goal(addDays(start, 3), 200);
    ctx = await buildAchievementCtx(repos, today);
    expect(ctx.proteinRun).toBe(3);
    expect(ctx.fiberRun).toBe(5);
  });

  it('unlocks once, with path levels every 2.5 %', async () => {
    await goal(addDays(today, -20), 150);
    await repos.weights.create({
      date: addDays(today, -20),
      time: '07:00',
      kg: 80,
      source: 'manual',
    });
    await eat(today, 100);
    const first = await evaluateAchievements(repos, today);
    expect(first.map((u) => u.def.id)).toEqual(
      expect.arrayContaining(['first_entry', 'first_weight']),
    );
    expect(await evaluateAchievements(repos, today)).toEqual([]);
    // Trend moves toward 70 kg → path levels.
    for (let i = 19; i >= 0; i--)
      await repos.weights.create({
        date: addDays(today, -i),
        time: '07:00',
        kg: 78,
        source: 'manual',
      });
    const next = await evaluateAchievements(repos, today);
    const path = next.find((u) => u.def.id === 'path');
    expect(path?.level).toBeGreaterThanOrEqual(4);
    expect((await repos.db.achievements.get('path'))?.progress).toBe(path?.level);
  });
});

describe('streaks, badge, ics', () => {
  it('intentional skip keeps the logging streak', async () => {
    await eat(addDays(today, -3), 100);
    await repos.dayMeta.upsert(addDays(today, -2), { intentionalSkip: true });
    await eat(addDays(today, -1), 100);
    expect((await loadStreaks(repos, today)).log).toMatchObject({ current: 3, freezesUsed: 0 });
  });

  it('badge values', async () => {
    await goal('2020-01-01', 160);
    await eat(today, 100);
    expect(await badgeValue(repos, today)).toBeNull();
    await repos.settings.set(SETTINGS.badgeMode.key, 'protein');
    expect(await badgeValue(repos, today)).toBe(60);
    await repos.settings.set(SETTINGS.badgeMode.key, 'weigh');
    expect(await badgeValue(repos, today)).toBeNull();
    await repos.weights.create({
      date: addDays(today, -4),
      time: '07:00',
      kg: 80,
      source: 'manual',
    });
    expect(await badgeValue(repos, today)).toBe(4);
  });

  it('ics from settings', async () => {
    expect(nextWeekday('2026-03-05', 0)).toBe('2026-03-08');
    expect(nextWeekday('2026-03-08', 0)).toBe('2026-03-08');
    await repos.settings.set(SETTINGS.weighTime.key, '06:45');
    const ics = await buildRemindersIcs(repos, '2026-03-05');
    expect(ics).toContain('DTSTART:20260305T064500');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  });
});

describe('UI', () => {
  it('achievements page shows streak and catalog', async () => {
    await renderApp('/more/achievements');
    expect(await screen.findByText(ru.achievements.streak)).toBeVisible();
    expect(screen.getByText('Первая запись')).toBeInTheDocument();
  });

  it('reminders page downloads the .ics', async () => {
    const create = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const user = userEvent.setup();
    await renderApp('/more/reminders');
    await user.click(await screen.findByRole('button', { name: ru.reminders.download }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('marks an empty day as intentionally skipped', async () => {
    useUi.setState({ date: addDays(today, -1) });
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.achievements.skipDay }));
    await waitFor(async () =>
      expect((await repos.dayMeta.get(addDays(today, -1))).intentionalSkip).toBe(true),
    );
  });
});

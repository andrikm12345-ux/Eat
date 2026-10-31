import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, parseLocalDate, toLocalDate } from '../domain/dates';
import { repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';
import { acceptCheckin, ensureCheckin, recomputeTdee, skipCheckin } from './tdee';
import { startTdeeSync } from './tdeeSync';

const today = toLocalDate(new Date());

/** 35 days: goal 2200 (lose −0.5), eating 2200 complete, weight falling 0.35 kg/week. */
async function seedHistory() {
  await repos.profile.save({
    sex: 'male',
    birthDate: '1990-01-01',
    heightCm: 180,
    activityLevel: 'light',
    exerciseCaloriesMode: 'none',
    weekStartsOn: 1,
    units: 'metric',
  });
  await repos.goals.create({
    validFrom: addDays(today, -35),
    type: 'lose',
    rateKgPerWeek: -0.5,
    kcal: 2200,
    protein: 160,
    fat: 61,
    carbs: 253,
    source: 'wizard',
  });
  for (let i = 35; i >= 1; i--) {
    const date = addDays(today, -i);
    await repos.entries.add({
      date,
      time: '12:00',
      items: [
        { name: 'Еда', grams: 0, nutrients: { kcal: 2200, protein: 150, fat: 60, carbs: 260 } },
      ],
      source: 'quick',
    });
    await repos.dayMeta.upsert(date, { complete: true });
    await repos.weights.create({
      date,
      time: '07:00',
      kg: 85 - ((35 - i) * 0.35) / 7,
      source: 'manual',
    });
  }
}

const mondayIndex = (d: string) => (parseLocalDate(d).getDay() + 6) % 7;

describe('TDEE service', () => {
  it('recomputes history from local data', async () => {
    await seedHistory();
    const state = await recomputeTdee(repos, today);
    expect(state?.rows).toHaveLength(36);
    expect(state!.last!.lowData).toBe(false);
    // 2200 eaten, −0.35 kg/wk ≈ −385 kcal/day → expenditure moves up from TDEE₀ toward ~2585.
    expect(state!.last!.tdee).toBeGreaterThan(2400);
    expect(await repos.db.tdeeHistory.count()).toBe(36);
  });

  it('returns null without profile/goal', async () => {
    expect(await recomputeTdee(repos, today)).toBeNull();
  });

  it('creates one pending check-in per week on/after the chosen weekday; accept sets a new goal from today', async () => {
    await seedHistory();
    await repos.settings.set(SETTINGS.checkinWeekday.key, (mondayIndex(today) + 1) % 7);
    const state = await recomputeTdee(repos, today);
    const c = await ensureCheckin(repos, today, state);
    expect(c?.status).toBe('pending');
    expect(c?.explanation).toMatch(
      /^За 3 нед\. в среднем 2\s200 ккал в день, тренд −0,3\d кг\/нед → расход ≈ /,
    );
    expect(Math.abs(c!.proposedKcal - 2200)).toBeLessThanOrEqual(200);
    expect(await ensureCheckin(repos, today, state)).toBeNull();

    await acceptCheckin(repos, c!, c!.proposedKcal, today);
    expect(await repos.goals.goalFor(today)).toMatchObject({
      source: 'checkin',
      kcal: c!.proposedKcal,
      validFrom: today,
      type: 'lose',
    });
    expect((await repos.goals.goalFor(addDays(today, -1)))?.kcal).toBe(2200);
    expect((await repos.checkins.get(c!.id))?.status).toBe('accepted');
  });

  it('no check-in before the weekday or with little data; skip works', async () => {
    await seedHistory();
    const state = await recomputeTdee(repos, today);
    if (mondayIndex(today) < 6) {
      await repos.settings.set(
        SETTINGS.checkinWeekday.key,
        (mondayIndex(today) + 2) % 7 === 0 ? 0 : mondayIndex(today) + 2,
      );
      if (mondayIndex(today) + 1 < 6) expect(await ensureCheckin(repos, today, state)).toBeNull();
    }
    expect(await ensureCheckin(repos, today, null)).toBeNull();
    await repos.settings.set(SETTINGS.checkinWeekday.key, (mondayIndex(today) + 1) % 7);
    const c = await ensureCheckin(repos, today, state);
    await skipCheckin(repos, c!);
    expect((await repos.checkins.get(c!.id))?.status).toBe('skipped');
  });

  it('sync recomputes after data changes', async () => {
    await seedHistory();
    const stop = startTdeeSync(repos, 10);
    await waitFor(async () => expect(await repos.db.tdeeHistory.count()).toBe(36), {
      timeout: 3000,
    });
    stop();
    await new Promise((res) => setTimeout(res, 300)); // let an in-flight run finish
  });
});

describe('check-in UI', () => {
  it('banner → check-in page → accept', async () => {
    await seedHistory();
    await repos.settings.set(SETTINGS.checkinWeekday.key, (mondayIndex(today) + 1) % 7);
    const state = await recomputeTdee(repos, today);
    const c = await ensureCheckin(repos, today, state);
    const user = userEvent.setup();
    await renderApp('/', { seed: false });
    expect(await screen.findByText(ru.checkin.banner)).toBeVisible();
    await user.click(screen.getByRole('link', { name: ru.checkin.open }));
    expect(await screen.findByText(/^За 3 нед\./)).toBeVisible();
    expect(c).toBeTruthy();
    await user.click(screen.getByRole('button', { name: ru.checkin.accept }));
    await waitFor(async () => expect((await repos.goals.goalFor(today))?.source).toBe('checkin'));
  });

  it('pausing the week marks its days as excluded', async () => {
    await seedHistory();
    const user = userEvent.setup();
    await renderApp('/progress', { seed: false });
    await user.click(await screen.findByRole('button', { name: ru.energy.pause }));
    await waitFor(async () => expect((await repos.dayMeta.get(today)).excludeFromTdee).toBe(true));
    expect(await screen.findByRole('button', { name: ru.energy.unpause })).toBeVisible();
  });
});

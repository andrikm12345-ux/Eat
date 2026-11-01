import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../../ai/settings';
import { addDays, toLocalDate, weekStart } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { insightsKey, loadWeekReport, weeklyAggregates } from '../../services/reports';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

const ws = weekStart(toLocalDate(new Date()));

async function seedWeek() {
  // Day 1: buckwheat with iron known (1000 kcal); day 2: quick entry without micros (500 kcal).
  await repos.entries.add({
    date: ws,
    time: '13:00',
    items: [
      {
        name: 'Гречка',
        grams: 300,
        nutrients: { kcal: 1000, protein: 40, fat: 10, carbs: 180, iron: 6, fiber: 12 },
      },
    ],
    source: 'manual',
  });
  await repos.entries.add({
    date: addDays(ws, 1) <= toLocalDate(new Date()) ? addDays(ws, 1) : ws,
    time: '19:00',
    items: [{ name: 'Кафе', grams: 0, nutrients: { kcal: 500, protein: 20, fat: 20, carbs: 50 } }],
    source: 'quick',
  });
  await repos.dayMeta.upsert(ws, { waterMl: 1400, steps: 9000 });
  await repos.workouts.create({
    date: ws,
    time: '18:00',
    type: 'Бег',
    durationMin: 30,
    kcal: 300,
    source: 'manual',
  });
}

describe('weekly report (no AI, no network)', () => {
  it('builds averages, top sources, micro coverage and activity offline', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await seedWeek();
    const w = await loadWeekReport(repos, ws);
    const days = w.loggedDays;
    expect(days).toBeGreaterThanOrEqual(1);
    expect(w.topKcal[0]).toMatchObject({ name: 'Гречка', value: 1000 });
    const iron = w.micros.find((m) => m.def.key === 'iron')!;
    expect(iron.coverage).toBeCloseTo(1000 / 1500);
    expect(iron.lowData).toBe(false);
    const vitC = w.micros.find((m) => m.def.key === 'vitC')!;
    expect(vitC).toMatchObject({ coverage: 0, lowData: true });
    expect(w.workouts).toEqual({ count: 1, minutes: 30, kcal: 300 });
    expect(w.waterAvg).toBe(200);
    expect(w.stepsAvg).toBe(9000);
    const agg = weeklyAggregates(w);
    expect(JSON.stringify(agg)).not.toMatch(/data:image|base64/);
    expect(agg.averages.kcal).toBe(Math.round(1500 / days));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders the report tabs', async () => {
    await seedWeek();
    const user = userEvent.setup();
    await renderApp('/reports');
    expect(await screen.findByText(ru.reports.topKcal)).toBeVisible();
    expect(screen.queryByText(ru.reports.aiTitle)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: ru.reports.tabs.micro }));
    expect(await screen.findByRole('meter', { name: 'Железо' })).toBeVisible();
    await user.click(screen.getByRole('radio', { name: ru.reports.tabs.energy }));
    expect(await screen.findByText(ru.energy.title)).toBeVisible();
  });
});

describe('AI observations (prompt C)', () => {
  it('sends aggregates only and stores the result for the week', async () => {
    await seedWeek();
    await repos.settings.set(AI_KEYS.enabled, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.consent, true);
    const answer = {
      observations: [{ title: 'Белок', text: 'В среднем 60 г белка.', evidence: 'protein avg' }],
      suggestions: [{ text: 'Добавьте творог на завтрак', type: 'protein' }],
      dataQuality: 'limited',
    };
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }] }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    await renderApp('/reports');
    await user.click(await screen.findByRole('button', { name: ru.reports.aiGet }));
    expect(await screen.findByText('Добавьте творог на завтрак')).toBeVisible();
    const body = JSON.parse(
      (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(JSON.stringify(body.messages)).not.toContain('"image"');
    await waitFor(async () =>
      expect(await repos.settings.get(insightsKey(ws), null)).toMatchObject({
        dataQuality: 'limited',
      }),
    );
  });
});

describe('micronutrients without enough data', () => {
  it('shows one message and tucks the empty rows under "Показать все"', async () => {
    const user = userEvent.setup();
    await renderApp('/reports');
    await user.click(await screen.findByRole('radio', { name: ru.reports.tabs.micro }));
    expect(await screen.findByText(ru.reports.microNoData)).toBeVisible();
    const toggle = screen.getByText(/^Показать все \(\d+\)$/);
    expect(screen.queryByRole('meter', { name: 'Железо' })).not.toBeVisible();
    await user.click(toggle);
    expect(screen.getByRole('meter', { name: 'Железо' })).toBeVisible();
  });
});

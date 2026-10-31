import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

const today = () => toLocalDate(new Date());

describe('weighing', () => {
  it('weighs from Today with the keypad (prefilled with the last weight)', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.weight.weigh }));
    const dialog = screen.getByRole('dialog', { name: ru.weight.sheetTitle });
    expect(dialog).toHaveTextContent('80,0');
    await user.click(screen.getByRole('button', { name: ru.weight.minus }));
    expect(dialog).toHaveTextContent('79,9');
    for (const k of ['7', '9', ',', '4']) await user.click(screen.getByRole('button', { name: k }));
    expect(dialog).toHaveTextContent('79,4');
    await user.click(screen.getByRole('button', { name: ru.common.save }));
    await waitFor(async () => expect((await repos.weights.latest())?.kg).toBe(79.4));
  });

  it('opens from the weigh shortcut', async () => {
    await renderApp('/?action=weigh');
    expect(await screen.findByRole('dialog', { name: ru.weight.sheetTitle })).toBeVisible();
  });

  it('rejects implausible values', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.weight.weigh }));
    await user.click(screen.getByRole('button', { name: '9' }));
    expect(screen.getByText(ru.weight.invalid)).toBeVisible();
    expect(screen.getByRole('button', { name: ru.common.save })).toBeDisabled();
  });
});

describe('progress page', () => {
  it('shows the chart, goal scale with forecast and history', async () => {
    // Seeded goal: target 74 kg, valid since 2020. Add a falling series.
    for (let i = 30; i >= 1; i--) {
      await repos.weights.create({
        date: addDays(today(), -i),
        time: '07:00',
        kg: 83 - (30 - i) * 0.1,
        source: 'manual',
      });
    }
    await renderApp('/progress');
    expect(await screen.findByRole('img', { name: /Вес и тренд/ })).toBeVisible();
    expect(screen.getByText(/Пройдено \d+ %/)).toBeVisible();
    expect(screen.getByText(/Прогноз: .* \(оценка/)).toBeVisible();
    expect(screen.getByText(ru.progress.history)).toBeVisible();
  });

  it('changes trend settings', async () => {
    const user = userEvent.setup();
    await renderApp('/progress');
    await user.click(await screen.findByRole('radio', { name: ru.progress.pickMin }));
    await waitFor(async () =>
      expect(await repos.settings.get(SETTINGS.weightDailyPick.key, 'first')).toBe('min'),
    );
  });
});

describe('measurements', () => {
  it('computes Navy body fat and saves', async () => {
    const user = userEvent.setup();
    await renderApp('/progress/measurements');
    await user.click(await screen.findByRole('button', { name: ru.measure.new }));
    await user.type(screen.getByLabelText(ru.measure.neck), '38');
    expect(screen.getByText(ru.measure.needFor('male'))).toBeVisible();
    await user.type(screen.getByLabelText(ru.measure.waist), '90');
    expect(screen.getByText(/% жира: \d+,\d %/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.measure.save }));
    await waitFor(async () => expect(await repos.measurements.list()).toHaveLength(1));
    const [m] = await repos.measurements.list();
    expect(m).toMatchObject({ neckCm: 38, waistCm: 90, method: 'navy' });
    expect(m!.bodyFatPct).toBeGreaterThan(15);
    expect(await screen.findByText(ru.measure.lbm)).toBeVisible();
  });

  it('weekly reminder banner shows on the chosen day and can be dismissed', async () => {
    const dow = new Date().getDay();
    await repos.settings.set(SETTINGS.measureWeekday.key, dow);
    const user = userEvent.setup();
    await renderApp('/');
    expect(await screen.findByText(ru.banners.measure)).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: `${ru.banners.close}: ${ru.banners.measure}` }),
    );
    await waitFor(() => expect(screen.queryByText(ru.banners.measure)).not.toBeInTheDocument());
  });
});

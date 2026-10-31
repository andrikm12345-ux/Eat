import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

const t = ru.wizard;

describe('onboarding wizard', () => {
  it('redirects to the wizard without a profile', async () => {
    const { router } = await renderApp('/', { seed: false });
    expect(await screen.findByRole('heading', { name: t.steps.about })).toBeVisible();
    expect(router.state.location.pathname).toBe('/wizard');
  });

  it('walks through all steps and saves profile, weight and goal', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/wizard', { seed: false });
    await screen.findByRole('heading', { name: t.steps.about });

    const next = () => screen.getByRole('button', { name: t.next });
    expect(next()).toBeDisabled();
    await user.type(screen.getByLabelText(t.birthDate), '1996-01-01');
    await user.type(screen.getByLabelText(t.height), '180');
    await user.click(next());

    await user.type(screen.getByLabelText(t.weight), '80,0');
    await user.click(screen.getByRole('radio', { name: new RegExp(ru.activity.moderate.title) }));
    await user.click(next());

    expect(screen.getByRole('radio', { name: ru.goalType.lose })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('radio', { name: /^0,5 %/ }));
    await user.type(screen.getByLabelText(t.targetWeight), '74');
    await user.click(next());

    await user.type(screen.getByLabelText(t.neck), '38');
    await user.type(screen.getByLabelText(t.waist), '90');
    expect(screen.getByText(/Оценка жира по обхватам/)).toBeVisible();
    await user.click(next());

    expect(screen.getByRole('heading', { name: t.steps.summary })).toBeVisible();
    expect(screen.getByText(/Базовый обмен/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.save }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const today = toLocalDate(new Date());
    const profile = await repos.profile.get();
    expect(profile).toMatchObject({ sex: 'male', heightCm: 180, activityLevel: 'moderate' });
    const goal = await repos.goals.goalFor(today);
    expect(goal).toMatchObject({
      type: 'lose',
      rateKgPerWeek: -0.4,
      source: 'wizard',
      targetWeightKg: 74,
    });
    expect(goal!.kcal % 10).toBe(0);
    expect((await repos.weights.latest())?.kg).toBe(80);
    const [m] = await repos.measurements.list();
    expect(m).toMatchObject({ neckCm: 38, waistCm: 90, method: 'navy' });
  });

  it('blocks a weight-loss goal when BMI < 18.5', async () => {
    const user = userEvent.setup();
    await renderApp('/wizard', { seed: false });
    await screen.findByRole('heading', { name: t.steps.about });
    await user.type(screen.getByLabelText(t.birthDate), '1996-01-01');
    await user.type(screen.getByLabelText(t.height), '180');
    await user.click(screen.getByRole('button', { name: t.next }));
    await user.type(screen.getByLabelText(t.weight), '55');
    await user.click(screen.getByRole('button', { name: t.next }));
    expect(screen.getByText(ru.warnings.underweightLose)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.next }));
    await user.click(screen.getByRole('button', { name: t.next }));
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
  });
});

describe('profile & goals', () => {
  it('saves a manual goal with a new validFrom and keeps past days', async () => {
    const user = userEvent.setup();
    await renderApp('/more/profile');
    await screen.findByRole('heading', { name: ru.goals.current });
    await user.click(screen.getByRole('button', { name: ru.goals.editManual }));
    const kcal = screen.getByLabelText(ru.wizard.summaryKcal);
    await user.clear(kcal);
    await user.type(kcal, '2000');
    await user.click(screen.getByRole('button', { name: ru.goals.manualSave }));
    const today = toLocalDate(new Date());
    await waitFor(async () => expect((await repos.goals.goalFor(today))?.kcal).toBe(2000));
    expect((await repos.goals.goalFor('2021-01-01'))?.kcal).toBe(2200);
    expect((await repos.goals.goalFor(today))?.source).toBe('manual');
  });

  it('opens from the More menu', async () => {
    const user = userEvent.setup();
    await renderApp('/more');
    await user.click(await screen.findByRole('link', { name: /Профиль и цели/ }));
    expect(await screen.findByRole('heading', { name: ru.goals.title })).toBeVisible();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

const t = ru.wizard;

describe('onboarding wizard', () => {
  it('a new visitor first sees sign in / create account', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/', { seed: false, signedOut: true });
    expect(await screen.findByRole('link', { name: ru.welcome.signUp })).toBeVisible();
    // There is no way to skip the account.
    expect(screen.queryByText(/Пока без аккаунта/)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
    await user.click(screen.getByRole('link', { name: ru.welcome.signIn }));
    expect(await screen.findByRole('radio', { name: ru.account.tabs.signIn })).toBeChecked();
  });

  it('create account opens on the sign-up tab', async () => {
    const user = userEvent.setup();
    await renderApp('/welcome', { seed: false, signedOut: true });
    await user.click(await screen.findByRole('link', { name: ru.welcome.signUp }));
    expect(await screen.findByRole('radio', { name: ru.account.tabs.signUp })).toBeChecked();
  });

  it('whoever is not signed in is sent to the welcome screen, even with a profile on the device', async () => {
    const { router } = await renderApp('/', { signedOut: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'));
    expect(await screen.findByRole('link', { name: ru.welcome.signIn })).toBeVisible();
  });

  it('a signed-in visitor without a profile is sent to the wizard', async () => {
    const { router } = await renderApp('/', { seed: false });
    await waitFor(() => expect(router.state.location.pathname).toBe('/wizard'));
    expect(await screen.findByRole('heading', { name: t.steps.about })).toBeVisible();
  });

  it('a signed-in visitor skips the welcome screen', async () => {
    await repos.settings.set('accountToken', 'x');
    const { router } = await renderApp('/welcome', { seed: false });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('walks through all steps and saves profile, weight and goal', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/wizard', { seed: false });
    await screen.findByRole('heading', { name: t.steps.about });

    const next = () => screen.getByRole('button', { name: t.next });
    expect(next()).toBeDisabled();
    await user.type(screen.getByLabelText(t.birthDate), '01011996');
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
    await user.type(screen.getByLabelText(t.birthDate), '01011996');
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

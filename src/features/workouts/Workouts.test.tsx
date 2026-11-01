import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';
import { seedOnboarded } from '../../test/seed';

const t = ru.workouts;

describe('workout with exercises', () => {
  it('defaults to bar work and records pull-ups and dips with sets × reps', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    expect(await screen.findByRole('button', { name: 'Турник и брусья' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '+ Подтягивания' }));
    await user.click(screen.getByRole('button', { name: '+ Отжимания на брусьях' }));
    const sets = screen.getByLabelText(`${t.sets}: Подтягивания`);
    await user.clear(sets);
    await user.type(sets, '4');
    const weight = screen.getByLabelText(`${t.weight}: Отжимания на брусьях`);
    await user.type(weight, '10');
    // An empty row is ignored on save.
    await user.click(screen.getByRole('button', { name: t.addExercise }));
    await user.click(screen.getByRole('button', { name: /^Сохранить/ }));
    await waitFor(async () => expect(await repos.workouts.list()).toHaveLength(1));
    const [w] = await repos.workouts.list();
    expect(w).toMatchObject({
      type: 'Турник и брусья',
      exercises: [
        { name: 'Подтягивания', sets: 4, reps: 10 },
        { name: 'Отжимания на брусьях', sets: 3, reps: 10, weightKg: 10 },
      ],
    });
    expect(w!.kcal).toBeGreaterThan(0);
  });

  it('removes a row and shows the exercises in the list and on Today', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    await user.click(await screen.findByRole('button', { name: '+ Отжимания от пола' }));
    await user.click(screen.getByRole('button', { name: '+ Подтягивания' }));
    await user.click(screen.getByRole('button', { name: t.removeExercise('Отжимания от пола') }));
    expect(screen.queryByLabelText(`${t.sets}: Отжимания от пола`)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Сохранить/ }));
    await waitFor(async () => expect(await repos.workouts.list()).toHaveLength(1));
    const { router } = await renderApp('/workouts', { seed: false });
    expect((await screen.findAllByText('Подтягивания 3×10')).length).toBeGreaterThan(0);
    await router.navigate('/');
    expect((await screen.findAllByText('Подтягивания 3×10')).length).toBeGreaterThan(0);
  });

  it('the workout screen switches whether workouts count toward the daily goal', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    const group = await screen.findByRole('radiogroup', { name: t.modeTitle });
    await user.click(within(group).getByRole('radio', { name: t.modeShort.half }));
    await waitFor(async () =>
      expect((await repos.profile.get())?.exerciseCaloriesMode).toBe('half'),
    );
    expect((await repos.profile.get())?.heightCm).toBe(180);
  });

  it('a counted workout raises the goal on Today', async () => {
    const today = toLocalDate(new Date());
    await seedOnboarded();
    const p = (await repos.profile.get())!;
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = p;
    await repos.profile.save({ ...rest, exerciseCaloriesMode: 'full' });
    await repos.workouts.create({
      date: today,
      time: '18:00',
      type: 'Турник, брусья, воркаут',
      durationMin: 60,
      kcal: 300,
      source: 'manual',
      exercises: [{ name: 'Подтягивания', sets: 5, reps: 8 }],
    });
    await renderApp('/', { seed: false });
    expect(await screen.findByText(ru.activityCard.goalBonus('300'))).toBeVisible();
  });

  it('"Другое" takes a custom name; own calories override the estimate', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    await user.click(await screen.findByRole('button', { name: 'Другое' }));
    await user.type(screen.getByLabelText(t.customName), 'Бокс');
    await user.click(screen.getByText(t.more));
    await user.type(screen.getByLabelText(t.kcal), '400');
    await user.type(screen.getByLabelText(t.note), 'спарринг');
    expect(screen.getByRole('button', { name: t.saveWith('400') })).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.saveWith('400') }));
    await waitFor(async () => expect(await repos.workouts.list()).toHaveLength(1));
    expect((await repos.workouts.list())[0]).toMatchObject({
      type: 'Бокс',
      kcal: 400,
      note: 'спарринг',
    });
  });

  it('a custom duration works and an empty one disables saving', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    const own = await screen.findByLabelText(t.durationCustom);
    await user.clear(own);
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
    await user.type(own, '20');
    const chips = within(screen.getByRole('group', { name: t.duration })).getAllByRole('button');
    expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByRole('button', { name: /^Сохранить ·/ })).toBeEnabled();
  });

  it('adding exercises recalculates the length and the calories; a chosen length wins', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new');
    await screen.findByRole('button', { name: /^Сохранить/ });
    const save = () => screen.getByRole('button', { name: /^Сохранить/ }).textContent;
    // Default: 45 min of moderate bar work at 80 kg: (3.8 − 1) × 80 × 0.75 = 168
    await waitFor(() => expect(save()).toContain('168'));
    await user.click(screen.getByRole('button', { name: '+ Подтягивания' }));
    await user.click(screen.getByRole('button', { name: '+ Отжимания на брусьях' }));
    await user.click(screen.getByRole('button', { name: '+ Отжимания от пола' }));
    // 3 exercises of 3 × 10 → 18 min → (3.8 − 1) × 80 × 0.3 = 67
    expect(screen.getByText(t.fromExercises(18))).toBeVisible();
    expect(save()).toContain('67');
    // Extra weight raises it: average +16 kg on 80 kg → ×1.2 → 81
    await user.type(screen.getByLabelText(`${t.weight}: Подтягивания`), '16');
    await user.type(screen.getByLabelText(`${t.weight}: Отжимания на брусьях`), '16');
    await user.type(screen.getByLabelText(`${t.weight}: Отжимания от пола`), '16');
    expect(save()).toContain('81');
    // Picking a length by hand stops the automatic length.
    await user.click(screen.getByRole('button', { name: `60 ${t.minutes}` }));
    expect(screen.queryByText(t.fromExercises(18))).not.toBeInTheDocument();
    expect(save()).toContain('269');
  });

  it('the save button is kept in a bar that stays in reach', async () => {
    await renderApp('/workouts/new');
    const button = await screen.findByRole('button', { name: /^Сохранить/ });
    expect(button.parentElement?.className).toMatch(/saveBar/);
  });
});

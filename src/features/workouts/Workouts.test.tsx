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
    expect(await screen.findByLabelText(t.type)).toHaveValue('calisthenics');
    await user.click(screen.getByRole('button', { name: '+ Подтягивания' }));
    await user.click(screen.getByRole('button', { name: '+ Отжимания на брусьях' }));
    const sets = screen.getByLabelText(`${t.sets}: Подтягивания`);
    await user.clear(sets);
    await user.type(sets, '4');
    const weight = screen.getByLabelText(`${t.weight}: Отжимания на брусьях`);
    await user.type(weight, '10');
    // An empty row is ignored on save.
    await user.click(screen.getByRole('button', { name: t.addExercise }));
    await user.click(screen.getByRole('button', { name: t.save }));
    await waitFor(async () => expect(await repos.workouts.list()).toHaveLength(1));
    const [w] = await repos.workouts.list();
    expect(w).toMatchObject({
      type: 'Турник, брусья, воркаут',
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
    await user.click(screen.getByRole('button', { name: t.save }));
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
});

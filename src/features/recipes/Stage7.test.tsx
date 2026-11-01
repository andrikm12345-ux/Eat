import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { saveAsTemplate } from '../../services/entries';
import { importRows } from '../../services/csvImport';
import { useUi } from '../../state/ui';
import { renderApp } from '../../test/renderApp';

async function pasta() {
  return repos.foods.add({
    name: 'Макароны сухие',
    per100g: { kcal: 350, protein: 12, fat: 1.5, carbs: 70 },
    servings: [],
    source: 'base',
    verified: true,
  });
}

describe('recipes', () => {
  it('creates a recipe with cooked weight and logs a serving', async () => {
    await pasta();
    const user = userEvent.setup();
    const { router } = await renderApp('/recipes/new');
    await user.type(await screen.findByLabelText(ru.recipes.name), 'Паста');
    await user.click(screen.getByRole('button', { name: ru.recipes.addIngredient }));
    const sheet = screen.getByRole('dialog', { name: ru.recipes.pickIngredient });
    await user.type(within(sheet).getByLabelText(ru.search.placeholder), 'макар');
    await user.click(await within(sheet).findByRole('button', { name: /Макароны сухие/ }));
    const grams = screen.getByLabelText('Макароны сухие');
    await user.clear(grams);
    await user.type(grams, '200');
    await user.type(screen.getByLabelText(ru.recipes.cookedWeight), '500');
    const servings = screen.getByLabelText(ru.recipes.servings);
    await user.clear(servings);
    await user.type(servings, '2');
    // 700 kcal / 500 g = 140 per 100 g; serving 250 g
    expect(screen.getByText('140 ккал')).toBeVisible();
    expect(screen.getByText(ru.recipes.perServing('250'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.recipes.save }));
    await waitFor(async () => expect(await repos.recipes.list()).toHaveLength(1));
    const [rc] = await repos.recipes.list();
    expect(rc).toMatchObject({ cookedWeightG: 500, servingsCount: 2, per100g: { kcal: 140 } });

    useUi.setState({ date: '2026-03-01' });
    await router.navigate(`/add/recipe/${rc!.id}?date=2026-03-01&time=19:00`);
    await user.click(await screen.findByRole('button', { name: ru.portion.add }));
    await waitFor(async () =>
      expect((await repos.entries.byDate('2026-03-01'))[0]?.totals.kcal).toBe(350),
    );
    expect((await repos.entries.byDate('2026-03-01'))[0]!.items[0]).toMatchObject({
      recipeId: rc!.id,
      grams: 250,
    });
  });
});

describe('templates', () => {
  it('template → review → save', async () => {
    const e = await repos.entries.add({
      date: '2026-02-01',
      time: '08:00',
      items: [
        { name: 'Каша', grams: 200, nutrients: { kcal: 300, protein: 10, fat: 5, carbs: 50 } },
      ],
      source: 'manual',
    });
    await saveAsTemplate(repos, e, 'Завтрак');
    const user = userEvent.setup();
    await renderApp('/add/template?date=2026-03-01&time=08:30');
    await user.click(await screen.findByRole('button', { name: /Завтрак/ }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    const grams = screen.getByLabelText(/^Количество: Каша/);
    await user.clear(grams);
    await user.type(grams, '100');
    await user.click(screen.getByRole('button', { name: ru.review.save }));
    await waitFor(async () =>
      expect((await repos.entries.byDate('2026-03-01'))[0]).toMatchObject({
        source: 'template',
        mealLabel: 'Завтрак',
        totals: { kcal: 150 },
      }),
    );
  });
});

describe('workouts and exercise calories', () => {
  it('estimates net kcal (above resting) by kind and effort, and saves', async () => {
    const user = userEvent.setup();
    await renderApp('/workouts/new?date=2026-03-01');
    await user.click(await screen.findByRole('button', { name: 'Бег' }));
    await user.click(screen.getByRole('button', { name: `45 ${ru.workouts.minutes}` }));
    // Medium effort run: (9.8 − 1) × 80 kg × 0.75 h = 528
    const save = screen.getByRole('button', { name: ru.workouts.saveWith('528') });
    // Harder effort raises the estimate: (11.8 − 1) × 80 × 0.75 = 648
    await user.click(screen.getByRole('radio', { name: ru.workouts.intensityName.hard }));
    expect(screen.getByText(ru.workouts.intensityHint.hard)).toBeVisible();
    expect(screen.getByRole('button', { name: ru.workouts.saveWith('648') })).toBe(save);
    await user.click(screen.getByRole('radio', { name: ru.workouts.intensityName.moderate }));
    await user.click(save);
    await waitFor(async () =>
      expect((await repos.workouts.list())[0]).toMatchObject({
        date: '2026-03-01',
        durationMin: 45,
        kcal: 528,
        type: 'Бег',
        intensity: 'moderate',
      }),
    );
  });

  it("mode 'none' does not change the goal; 'full' adds workout kcal", async () => {
    useUi.setState({ date: '2026-03-01' });
    await repos.workouts.create({
      date: '2026-03-01',
      time: '18:00',
      type: 'Бег',
      durationMin: 30,
      kcal: 300,
      source: 'manual',
    });
    await renderApp('/');
    expect(await screen.findByText(ru.activityCard.noGoalChange)).toBeVisible();
    expect(screen.getByText(/Цель/).parentElement).toHaveTextContent(/2\s200/);
    const p = (await repos.profile.get())!;
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p;
    await repos.profile.save({ ...rest, exerciseCaloriesMode: 'full' });
    expect(await screen.findByText(ru.activityCard.goalBonus('300'))).toBeVisible();
    await waitFor(() => expect(screen.getByText(/Цель/).parentElement).toHaveTextContent(/2\s500/));
  });
});

describe('CSV import', () => {
  it('maps columns, previews and imports weight, steps and workouts', async () => {
    const user = userEvent.setup();
    await renderApp('/data/csv');
    const csv =
      'Дата;Шаги;Вес;Тип;Длительность\n01.03.2026;10500;80,4;Бег;30\n02.03.2026;8000;;;\nмусор;1;2;;\n';
    await user.upload(
      await screen.findByTestId('csv-file'),
      new File([csv], 'export.csv', { type: 'text/csv' }),
    );
    expect(await screen.findByText(ru.csv.rows(2, 1))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.csv.import }));
    await waitFor(async () => expect(await repos.workouts.list()).toHaveLength(1));
    expect((await repos.dayMeta.get('2026-03-02')).steps).toBe(8000);
    expect(
      (await repos.weights.list()).some(
        (w) => w.date === '2026-03-01' && w.kg === 80.4 && w.source === 'import',
      ),
    ).toBe(true);
  });

  it('skips duplicates on re-import', async () => {
    const rows = [{ date: '2026-03-01', weight: 80, workout: { type: 'Бег', durationMin: 30 } }];
    expect(await importRows(repos, rows)).toEqual({ weights: 1, days: 0, workouts: 1 });
    expect(await importRows(repos, rows)).toEqual({ weights: 0, days: 0, workouts: 0 });
  });
});

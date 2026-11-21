import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

describe('a new product keeps its servings', () => {
  it('saves a named serving with its grams', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Кефир тест');
    await user.type(screen.getByLabelText(ru.foods.kcal), '60');
    await user.click(screen.getByRole('button', { name: ru.foods.addServing }));
    await user.type(screen.getByLabelText(ru.foods.servingLabel), 'стакан');
    await user.type(screen.getByLabelText(ru.foods.servingGrams), '250');
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () => {
      const f = (await repos.foods.list()).find((x) => x.name === 'Кефир тест');
      expect(f?.servings).toEqual([{ label: 'стакан', grams: 250 }]);
    });
  });
});

describe('what is easy to miss', () => {
  it('a serving with grams but no name is kept under the name «порция»', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Йогурт тест');
    await user.type(screen.getByLabelText(ru.foods.kcal), '70');
    await user.click(screen.getByRole('button', { name: ru.foods.addServing }));
    await user.type(screen.getByLabelText(ru.foods.servingGrams), '125');
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () => {
      const f = (await repos.foods.list()).find((x) => x.name === 'Йогурт тест');
      expect(f?.servings).toEqual([{ label: ru.foods.servingDefault, grams: 125 }]);
    });
  });

  it('the saved serving is offered on the portion screen', async () => {
    const f = await repos.foods.add({
      name: 'Кефир порц',
      per100g: { kcal: 60, protein: 3, fat: 3, carbs: 4 },
      servings: [{ label: 'стакан', grams: 250 }],
      source: 'user',
      verified: true,
    });
    await renderApp(`/add/food/${f.id}`);
    expect(await screen.findByText(/стакан/)).toBeVisible();
  });

  it('a named serving without grams does not save and says why', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Сок тест');
    await user.type(screen.getByLabelText(ru.foods.kcal), '45');
    await user.click(screen.getByRole('button', { name: ru.foods.addServing }));
    await user.type(screen.getByLabelText(ru.foods.servingLabel), 'пакет');
    expect(screen.getByRole('button', { name: ru.foods.save })).toBeDisabled();
    expect(screen.getByText(ru.foods.servingNeedsGrams('пакет'))).toBeVisible();
    await user.type(screen.getByLabelText(ru.foods.servingGrams), '200');
    expect(screen.getByRole('button', { name: ru.foods.save })).toBeEnabled();
    // An empty row (nothing typed) is just ignored.
    await user.click(screen.getByRole('button', { name: ru.foods.addServing }));
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () => {
      const f = (await repos.foods.list()).find((x) => x.name === 'Сок тест');
      expect(f?.servings).toEqual([{ label: 'пакет', grams: 200 }]);
    });
  });
});

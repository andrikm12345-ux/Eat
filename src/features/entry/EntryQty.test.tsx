import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logFood } from '../../services/entries';
import { renderApp } from '../../test/renderApp';

describe('entry screen: amount field', () => {
  it('lets you erase the amount completely and type a new one', async () => {
    const food = await repos.foods.add({
      name: 'Сок нектариновый',
      per100g: { kcal: 45, protein: 0.4, fat: 0, carbs: 10 },
      servings: [],
      source: 'user',
      verified: true,
    });
    const entry = await logFood(repos, food, 4, { date: toLocalDate(new Date()), time: '12:00' });
    const user = userEvent.setup();
    await renderApp(`/entry/${entry.id}`);
    const grams = await screen.findByLabelText(ru.portion.grams);
    expect(grams).toHaveValue('4');
    await user.clear(grams);
    expect(grams).toHaveValue('');
    await user.type(grams, '250');
    expect(grams).toHaveValue('250');
    expect((await screen.findAllByText(/113/)).length).toBeGreaterThan(0);
  });
});

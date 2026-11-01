import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

describe('foods list: delete', () => {
  it('deletes a product from the list and brings it back with Undo', async () => {
    const f = await repos.foods.add({
      name: 'Сухарики',
      per100g: { kcal: 394, protein: 10, fat: 15, carbs: 55 },
      servings: [],
      source: 'user',
      verified: true,
    });
    const user = userEvent.setup();
    await renderApp('/foods');
    await user.click(await screen.findByRole('button', { name: `${ru.common.delete}: Сухарики` }));
    await waitFor(() => expect(screen.queryByText(/Сухарики/)).toBeNull());
    expect((await repos.foods.list()).some((x) => x.id === f.id)).toBe(false);
    await user.click(await screen.findByRole('button', { name: ru.common.undo }));
    expect(await screen.findByText(/Сухарики/)).toBeVisible();
  });
});

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

describe('food form: hints and checks', () => {
  it('says what is missing under the disabled save button', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    expect(await screen.findByText(ru.foods.needName)).toBeVisible();
    await user.type(screen.getByLabelText(ru.foods.name), 'Пицца');
    expect(screen.queryByText(ru.foods.needName)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.foods.save })).toBeEnabled();
    const kcal = screen.getByLabelText(ru.foods.kcal);
    await user.type(kcal, '950');
    expect(await screen.findByText(ru.foods.kcalRange)).toBeVisible();
    await user.clear(kcal);
    await user.type(kcal, '300');
    await user.type(screen.getByLabelText(ru.foods.protein), '60');
    await user.type(screen.getByLabelText(ru.foods.fat), '30');
    await user.type(screen.getByLabelText(ru.foods.carbs), '30');
    expect(await screen.findByText(ru.foods.macrosRange)).toBeVisible();
  });

  it('warns about a barcode whose check digit does not match', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    const code = await screen.findByLabelText(ru.foods.barcode);
    await user.type(code, '4810268055578');
    expect(await screen.findByText(ru.foods.barcodeCheck)).toBeVisible();
    await user.clear(code);
    await user.type(code, '4810268055577');
    expect(screen.queryByText(ru.foods.barcodeCheck)).not.toBeInTheDocument();
  });
});

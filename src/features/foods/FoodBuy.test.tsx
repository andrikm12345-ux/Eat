import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

describe('shop and price of a product', () => {
  it('saves the shop and the price of a pack', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Творог цена');
    await user.type(screen.getByLabelText(ru.foods.kcal), '90');
    await user.type(screen.getByLabelText(ru.foods.store, { selector: 'input' }), 'Магнит');
    await user.type(screen.getByLabelText(ru.foods.price), '90');
    await user.click(screen.getByRole('radio', { name: ru.foods.priceForPack }));
    expect(screen.getByRole('button', { name: ru.foods.save })).toBeDisabled();
    expect(screen.getByText(ru.foods.packNeedsGrams)).toBeVisible();
    await user.type(screen.getByLabelText(ru.foods.packGrams), '450');
    expect(screen.getByText(ru.foods.pricePer100('20 ₽'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () => {
      const f = (await repos.foods.list()).find((x) => x.name === 'Творог цена');
      expect(f).toMatchObject({ store: 'Магнит', price: 90, priceGrams: 450 });
    });
  });

  it('a product without shop and price still saves', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Без цены');
    await user.type(screen.getByLabelText(ru.foods.kcal), '50');
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () => {
      const f = (await repos.foods.list()).find((x) => x.name === 'Без цены');
      expect(f).toBeDefined();
      expect(f?.price).toBeUndefined();
    });
  });
});

describe('the fat filter in the search', () => {
  it('lists only lean foods, most protein first', async () => {
    const user = userEvent.setup();
    await repos.foods.add({
      name: 'Курица тест',
      per100g: { kcal: 110, protein: 23, fat: 0.8, carbs: 0 },
      servings: [],
      source: 'user',
      verified: true,
    });
    await repos.foods.add({
      name: 'Масло тест',
      per100g: { kcal: 880, protein: 0, fat: 99, carbs: 0 },
      servings: [],
      source: 'user',
      verified: true,
    });
    await renderApp('/add/search');
    await user.click(await screen.findByRole('radio', { name: ru.search.fatFree }));
    expect(await screen.findByText(/Курица тест/)).toBeVisible();
    expect(screen.queryByText(/Масло тест/)).toBeNull();
  });
});

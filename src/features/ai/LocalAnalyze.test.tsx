import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { analyzeMealLocally } from '../../services/localMeal';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

const food = (name: string, kcal: number, servings: { label: string; grams: number }[] = []) =>
  repos.foods.add({
    name,
    per100g: { kcal, protein: 5, fat: 3, carbs: 20 },
    servings,
    source: 'base',
    verified: true,
  });

describe('analyze without AI', () => {
  it('matches catalog foods, quantities and pieces; falls back to Open Food Facts; leaves unknowns empty', async () => {
    await food('Овсяные хлопья', 380);
    await food('Банан', 89, [{ label: 'шт', grams: 118 }]);
    await food('Яйцо куриное', 143, [{ label: 'шт', grams: 50 }]);
    const off = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            products: [
              {
                code: '1',
                product_name: 'Коктейль Чудо',
                brands: 'Чудо',
                countries_tags: ['en:russia'],
                nutriments: {
                  'energy-kcal_100g': 72,
                  proteins_100g: 2.9,
                  fat_100g: 2,
                  carbohydrates_100g: 10.6,
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const draft = await analyzeMealLocally(
      repos,
      'овсяные хлопья 60 г, банан, 2 яйца, чудо коктейль 200 мл, абракадабра',
      { date: '2026-03-01', time: '08:00' },
      {
        fetchImpl: ((u: string) =>
          u.includes('abra') || u.includes('%D0%B0%D0%B1')
            ? Promise.resolve(new Response(JSON.stringify({ products: [] })))
            : off()) as unknown as typeof fetch,
        online: true,
      },
    );
    const by = Object.fromEntries(draft.items.map((i) => [i.name, i]));
    expect(by['Овсяные хлопья']).toMatchObject({
      grams: 60,
      source: 'catalog',
      confidence: 'medium',
    });
    expect(by['Банан']).toMatchObject({ grams: 118 });
    expect(by['Яйцо куриное']).toMatchObject({ grams: 100 });
    expect(by['Коктейль Чудо']).toMatchObject({ grams: 200, source: 'off', confidence: 'low' });
    expect(by['абракадабра']).toMatchObject({
      source: 'manual',
      confidence: 'low',
      per100g: { kcal: 0 },
    });
    expect(await repos.foods.byBarcode('1')).toBeDefined();
  });

  it('UI: describe → Анализировать → review → save', async () => {
    await food('Гречка варёная', 92);
    const user = userEvent.setup();
    const { router } = await renderApp('/add/ai-text?date=2026-03-01&time=13:00');
    await user.type(await screen.findByLabelText(ru.ai.text.label), 'гречка варёная 180 г');
    await user.click(screen.getByRole('button', { name: ru.ai.text.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.review.save }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [e] = await repos.entries.byDate('2026-03-01');
    expect(e!.items[0]).toMatchObject({ name: 'Гречка варёная', grams: 180 });
    expect(e!.totals.kcal).toBeCloseTo(165.6);
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

describe('online product search', () => {
  it('finds a branded product in Open Food Facts and opens its portion screen', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            products: [
              {
                code: '4600949010205',
                product_name: 'Коктейль молочный',
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
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    const { router } = await renderApp('/add/search?date=2026-03-01&time=10:00');
    await user.type(await screen.findByLabelText(ru.search.placeholder), 'чудо коктейль');
    await user.click(await screen.findByRole('button', { name: /Коктейль молочный · Чудо/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/add\/food\//));
    expect(await repos.foods.byBarcode('4600949010205')).toMatchObject({
      source: 'off',
      verified: false,
    });
    expect(await screen.findByRole('heading', { name: 'Коктейль молочный' })).toBeVisible();
  });

  it('searches by itself while typing (debounced, once per query) and not for very short input', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ products: [] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    await renderApp('/add/search');
    const input = await screen.findByLabelText(ru.search.placeholder);
    await user.type(input, 'ща');
    await new Promise((r) => setTimeout(r, 800));
    expect(f).not.toHaveBeenCalled();
    await user.type(input, 'кал');
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(await screen.findByText(ru.search.nothing)).toBeVisible();
  });

  it('a failing request is not reported as "no network"; the retry button searches again', async () => {
    let fail = true;
    const f = vi.fn(async () => {
      if (fail) throw new TypeError('Failed to fetch');
      return new Response(
        JSON.stringify({
          products: [
            {
              code: '5',
              product_name: 'Молоко отборное',
              brands: 'Белая Долина',
              countries_tags: ['en:russia'],
              nutriments: {
                'energy-kcal_100g': 73,
                proteins_100g: 3,
                fat_100g: 3.2,
                carbohydrates_100g: 4.7,
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    await renderApp('/add/search');
    await user.type(await screen.findByLabelText(ru.search.placeholder), 'белая долина');
    expect(await screen.findByText(ru.search.offError, undefined, { timeout: 6000 })).toBeVisible();
    expect(screen.queryByText(ru.search.offOffline)).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: ru.search.retry }));
    expect(
      await screen.findByRole(
        'button',
        { name: /Молоко отборное · Белая Долина/ },
        { timeout: 4000 },
      ),
    ).toBeVisible();
  }, 20000);

  it('says so when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    await renderApp('/add/search');
    await user.type(await screen.findByLabelText(ru.search.placeholder), 'что-то');
    expect(await screen.findByText(ru.search.offOffline)).toBeVisible();
    vi.restoreAllMocks();
  });
});

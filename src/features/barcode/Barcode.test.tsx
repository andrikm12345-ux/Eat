import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kefir } from '../../domain/__fixtures__/off';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { reviewKey, useReview } from '../../state/review';
import { renderApp } from '../../test/renderApp';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function enterCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(await screen.findByLabelText(ru.barcode.code), code);
  await user.click(screen.getByRole('button', { name: ru.barcode.find }));
}

describe('barcode flow', () => {
  it('shows a camera fallback and finds a product via OFF; saves only on "Сохранить"', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(kefir), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { router } = await renderApp('/add/barcode?date=2026-03-01&time=09:00');
    expect(await screen.findByText(ru.barcode.cameraUnavailable)).toBeVisible();
    await enterCode(user, '4607025392408');

    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(screen.getByText('Кефир 3,2% · Простоквашино')).toBeVisible();
    expect(screen.getByText(ru.review.unverified)).toBeVisible();
    expect(await repos.entries.byDate('2026-03-01')).toHaveLength(0); // nothing saved yet
    expect((await repos.foods.byBarcode('4607025392408'))?.source).toBe('off');

    const grams = screen.getByLabelText(/^Количество: Кефир/);
    expect(grams).toHaveValue('250');
    await user.click(screen.getByRole('button', { name: /Минус 10 г/ }));
    await user.click(screen.getByRole('button', { name: ru.review.save }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [e] = await repos.entries.byDate('2026-03-01');
    expect(e).toMatchObject({ source: 'barcode', time: '09:00' });
    expect(e!.items[0]!.grams).toBe(240);
    expect(e!.totals.kcal).toBeCloseTo(141.6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offline: suggests creating the product manually with the barcode', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    await renderApp('/add/barcode?date=2026-03-01&time=09:00');
    await enterCode(user, '4600000000017');
    expect(await screen.findByText(ru.barcode.offline)).toBeVisible();
    await user.click(screen.getByRole('link', { name: ru.barcode.createManual }));
    await screen.findByRole('heading', { name: ru.foods.new });
    expect(await screen.findByLabelText(ru.foods.barcode)).toHaveValue('4600000000017');
  });

  it('not found: offers to create a product', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })),
    );
    const user = userEvent.setup();
    await renderApp('/add/barcode');
    await enterCode(user, '1234567');
    expect(await screen.findByText(ru.barcode.notFound('1234567'))).toBeVisible();
  });

  it('not found → find by name → barcode is bound and found locally next time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })),
    );
    const food = await repos.foods.add({
      name: 'Творожок Чудо',
      per100g: { kcal: 150, protein: 5, fat: 8, carbs: 14 },
      servings: [],
      source: 'user',
      verified: true,
    });
    const user = userEvent.setup();
    await renderApp('/add/barcode?date=2026-03-01&time=09:00');
    await enterCode(user, '4610282720266');
    expect(await screen.findByText(ru.barcode.notInOpenBase)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.barcode.findByName }));
    const sheet = screen.getByRole('dialog', { name: ru.barcode.findTitle });
    await user.type(within(sheet).getByLabelText(ru.search.placeholder), 'творожок');
    await user.click(await within(sheet).findByRole('button', { name: /Творожок Чудо/ }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect((await repos.foods.byBarcode('4610282720266'))?.id).toBe(food.id);
  });

  it('uses the local cache without network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await repos.foods.add({
      name: 'Мой творог',
      barcode: '1112223',
      per100g: { kcal: 100, protein: 18, fat: 2, carbs: 3 },
      servings: [],
      source: 'user',
      verified: true,
    });
    const user = userEvent.setup();
    await renderApp('/add/barcode');
    await enterCode(user, '1112223');
    expect(await screen.findByText('Мой творог')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('review screen', () => {
  it('highlights low confidence, replaces from the catalog keeping grams, cancels without saving', async () => {
    await repos.foods.add({
      name: 'Рис белый варёный',
      per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
      servings: [],
      source: 'base',
      verified: true,
    });
    useReview.setState({
      draft: {
        items: [
          {
            key: reviewKey(),
            name: 'Рис',
            grams: 180,
            per100g: { kcal: 150, protein: 3, fat: 1, carbs: 30 },
            source: 'ai',
            confidence: 'low',
          },
        ],
        entrySource: 'ai_photo',
        date: '2026-03-01',
        time: '13:00',
        notes: 'масло для жарки предположено 10 г',
      },
    });
    const user = userEvent.setup();
    await renderApp('/review');
    expect(await screen.findByText(/уверенность низкая · проверьте граммовку/)).toBeVisible();
    expect(screen.getByText('масло для жарки предположено 10 г')).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.review.replace }));
    const sheet = screen.getByRole('dialog', { name: ru.review.replaceTitle });
    await user.type(within(sheet).getByLabelText(ru.search.placeholder), 'рис');
    await user.click(await within(sheet).findByRole('button', { name: /Рис белый варёный/ }));
    expect(screen.getByText('Рис белый варёный')).toBeVisible();
    expect(screen.getByLabelText(/^Количество: Рис белый/)).toHaveValue('180');
    expect(screen.getAllByText(/234 ккал/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: ru.common.cancel }));
    expect(await repos.entries.byDate('2026-03-01')).toHaveLength(0);
    expect(useReview.getState().draft).toBeNull();
  });

  it('saves and creates a template', async () => {
    useReview.setState({
      draft: {
        items: [
          {
            key: reviewKey(),
            name: 'Кофе',
            grams: 240,
            per100g: { kcal: 1, protein: 0.1, fat: 0, carbs: 0 },
            source: 'manual',
          },
        ],
        entrySource: 'manual',
        date: '2026-03-01',
        time: '08:00',
      },
    });
    const user = userEvent.setup();
    await renderApp('/review');
    await user.click(await screen.findByRole('button', { name: ru.review.saveTemplate }));
    const sheet = screen.getByRole('dialog', { name: ru.review.saveTemplate });
    await user.click(within(sheet).getByRole('button', { name: ru.common.save }));
    await waitFor(async () => expect(await repos.templates.list()).toHaveLength(1));
    expect(await repos.entries.byDate('2026-03-01')).toHaveLength(1);
  });

  it('redirects home without a draft', async () => {
    const { router } = await renderApp('/review');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

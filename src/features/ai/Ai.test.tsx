import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

const meal = {
  items: [
    {
      name: 'Овсянка на молоке',
      grams: 250,
      per100g: { kcal: 100, protein: 4, fat: 3, carbs: 14 },
      confidence: 'medium',
      assumed: false,
      searchHint: 'овсяная каша на молоке',
    },
  ],
  mealGuess: 'завтрак',
  notes: '',
};

describe('AI without a key', () => {
  it('the photo tile is temporarily unavailable; text AI stays', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.add.fab }));
    const sheet = screen.getByRole('dialog');
    expect(
      within(sheet).getByRole('button', { name: (n) => n.startsWith(ru.add.tiles.photoAi) }),
    ).toBeDisabled();
    expect(within(sheet).queryByText(/Этикетка/)).not.toBeInTheDocument();
    expect(within(sheet).getAllByText(ru.add.unavailable)).toHaveLength(1);
    expect(within(sheet).getByRole('button', { name: ru.add.tiles.textAi })).toBeEnabled();
  });

  it('direct links to the disabled screens show a notice', async () => {
    await renderApp('/add/ai-photo');
    expect(await screen.findByText(ru.add.unavailablePage)).toBeVisible();
  });

  it('the barcode "not found" screen does not offer the label shortcut', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })),
    );
    const user = userEvent.setup();
    await renderApp('/add/barcode');
    await user.type(await screen.findByLabelText(ru.barcode.code), '4610282720266');
    await user.click(screen.getByRole('button', { name: ru.barcode.find }));
    expect(await screen.findByText(ru.barcode.notInOpenBase)).toBeVisible();
    expect(screen.queryByRole('link', { name: ru.barcode.createLabel })).not.toBeInTheDocument();
  });

  it('the text screen works without a key and shows no AI setup hint', async () => {
    await renderApp('/add/ai-text');
    expect(await screen.findByLabelText(ru.ai.text.label)).toBeVisible();
    expect(screen.queryByText(ru.ai.text.localNote)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: ru.ai.setup })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.ai.text.go })).toBeDisabled();
  });
});

describe('AI text flow', () => {
  it('asks for consent, recognizes text and opens the review (nothing saved before Save)', async () => {
    await repos.settings.set(AI_KEYS.enabled, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(meal) }],
            stop_reason: 'end_turn',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    const { router } = await renderApp('/add/ai-text?date=2026-03-01&time=08:00');
    await user.click(await screen.findByRole('button', { name: ru.ai.consentAccept }));
    await waitFor(() => expect(screen.queryByText(ru.ai.text.consentNote)).not.toBeInTheDocument());
    await user.type(await screen.findByLabelText(ru.ai.text.label), 'овсянка 250 г');
    await user.click(screen.getByRole('button', { name: ru.ai.text.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(screen.getByText(/уверенность средняя/)).toBeVisible();
    expect(await repos.entries.byDate('2026-03-01')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: ru.review.save }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [e] = await repos.entries.byDate('2026-03-01');
    expect(e).toMatchObject({ source: 'ai_text', mealLabel: 'Завтрак' });
    expect(e!.aiRunId).toBeTruthy();
    expect(e!.items[0]).toMatchObject({ confidence: 'medium', grams: 250 });
  });

  it('falls back to the local analysis when the AI call fails', async () => {
    await repos.settings.set(AI_KEYS.enabled, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.consent, true);
    await repos.foods.add({
      name: 'Суп',
      per100g: { kcal: 50, protein: 2, fat: 2, carbs: 5 },
      servings: [],
      source: 'base',
      verified: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 401 })),
    );
    const user = userEvent.setup();
    await renderApp('/add/ai-text?date=2026-03-01&time=08:00');
    await user.type(await screen.findByLabelText(ru.ai.text.label), 'суп 300 г');
    await user.click(screen.getByRole('button', { name: ru.ai.text.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(screen.getByText(/ИИ недоступен/)).toBeVisible();
    expect(screen.getByLabelText(/^Количество: Суп/)).toHaveValue('300');
  });
});

describe('AI settings', () => {
  it('stores the key masked and toggles AI', async () => {
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await user.click(await screen.findByRole('switch', { name: ru.ai.enabled }));
    await user.type(screen.getByLabelText(ru.ai.key), 'sk-ant-api03-abcdefghijkl');
    await user.click(screen.getByRole('button', { name: ru.ai.saveKey }));
    expect(await screen.findByText(ru.ai.keySaved('sk-ant-…ijkl'))).toBeVisible();
    expect(await repos.settings.get(AI_KEYS.enabled, false)).toBe(true);
  });
});

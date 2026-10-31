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
  it('the photo tile is available; without a key it leads to the manual search', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.add.fab }));
    const sheet = screen.getByRole('dialog');
    const photo = within(sheet).getByRole('button', {
      name: (n) => n.startsWith(ru.add.tiles.photoAi),
    });
    expect(photo).toBeEnabled();
    expect(within(sheet).queryByText(ru.add.unavailable)).not.toBeInTheDocument();
    await user.click(photo);
    await waitFor(() => expect(router.state.location.pathname).toBe('/add/search'));
  });

  it('the barcode "not found" screen offers the label shortcut', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })),
    );
    const user = userEvent.setup();
    await renderApp('/add/barcode');
    await user.type(await screen.findByLabelText(ru.barcode.code), '4610282720266');
    await user.click(screen.getByRole('button', { name: ru.barcode.find }));
    expect(await screen.findByText(ru.barcode.notInOpenBase)).toBeVisible();
    expect(screen.getByRole('link', { name: ru.barcode.createLabel })).toBeVisible();
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
    // With AI switched on the screen shows which model will be used.
    expect(await screen.findByText(ru.ai.statusOn('claude-haiku-5-5'))).toBeVisible();
    await user.type(await screen.findByLabelText(ru.ai.text.label), 'овсянка 250 г');
    await user.click(screen.getByRole('button', { name: ru.ai.text.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(screen.getByText(/уверенность средняя/)).toBeVisible();
    // The review screen says the AI did the recognition, and with which model.
    expect(screen.getByText(ru.review.byAi('claude-haiku-5-5'))).toBeVisible();
    expect(screen.queryByText(ru.review.byCatalog)).not.toBeInTheDocument();
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
    expect(screen.getByText(ru.review.byCatalog)).toBeVisible();
    expect(screen.queryByText(/Распознано ИИ/)).not.toBeInTheDocument();
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

  it('shows the service models and picks them for text and photo', async () => {
    await repos.settings.set(AI_KEYS.apiKey, 'sk-teamo-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.baseUrl, 'https://r.example.com');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'vision-x' }] }),
        );
      }),
    );
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await user.click(await screen.findByRole('button', { name: ru.ai.modelsShow }));
    expect(await screen.findByText('vision-x')).toBeVisible();
    expect(calls[0]).toBe('https://r.example.com/v1/models?limit=200');
    await user.click(screen.getByRole('button', { name: `${ru.ai.forText}: deepseek-chat` }));
    await user.click(screen.getByRole('button', { name: `${ru.ai.forPhoto}: vision-x` }));
    await waitFor(async () => {
      expect(await repos.settings.get(AI_KEYS.modelText, '')).toBe('deepseek-chat');
      expect(await repos.settings.get(AI_KEYS.modelVision, '')).toBe('vision-x');
    });
  });

  it('reports a failed model list', async () => {
    await repos.settings.set(AI_KEYS.apiKey, 'sk-teamo-xxxxxxxxxxxx');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 401 })),
    );
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await user.click(await screen.findByRole('button', { name: ru.ai.modelsShow }));
    expect(await screen.findByText(ru.ai.modelsFail)).toBeVisible();
  });

  it('OpenAI format: presets fill the address and AI needs it to be ready', async () => {
    await repos.settings.set(AI_KEYS.apiKey, 'sk-or-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.enabled, true);
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await user.click(await screen.findByRole('radio', { name: ru.ai.formatOpenai }));
    expect(await screen.findByText(ru.ai.needAddress)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'OpenRouter' }));
    await waitFor(async () =>
      expect(await repos.settings.get(AI_KEYS.baseUrl, '')).toBe('https://openrouter.ai/api/v1'),
    );
    expect(await repos.settings.get(AI_KEYS.format, '')).toBe('openai');
    await waitFor(() => expect(screen.queryByText(ru.ai.needAddress)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'TokenHarbor' }));
    await waitFor(async () =>
      expect(await repos.settings.get(AI_KEYS.baseUrl, '')).toBe('https://tokenharbor.ai/v1'),
    );
    await user.click(screen.getByRole('button', { name: 'TeamoRouter' }));
    await waitFor(async () =>
      expect(await repos.settings.get(AI_KEYS.baseUrl, '')).toBe('https://api.teamorouter.com/v1'),
    );
  });

  it('model list: badges and the free / photo filters', async () => {
    await repos.settings.set(AI_KEYS.apiKey, 'sk-or-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.format, 'openai');
    await repos.settings.set(AI_KEYS.baseUrl, 'https://openrouter.ai/api/v1');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                { id: 'paid/model', pricing: { prompt: '1', completion: '1' } },
                { id: 'free/vision:free', architecture: { input_modalities: ['text', 'image'] } },
                { id: 'free/text:free', architecture: { input_modalities: ['text'] } },
              ],
            }),
          ),
      ),
    );
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await user.click(await screen.findByRole('button', { name: ru.ai.modelsShow }));
    expect(await screen.findByText('paid/model')).toBeVisible();
    expect(screen.getAllByText(new RegExp(ru.ai.freeBadge))).toHaveLength(2);
    expect(screen.getAllByText(new RegExp(ru.ai.visionBadge))).toHaveLength(1);
    await user.click(screen.getByRole('switch', { name: ru.ai.onlyFree }));
    expect(screen.queryByText('paid/model')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: ru.ai.onlyVision }));
    expect(screen.queryByText(/free\/text/)).not.toBeInTheDocument();
    expect(screen.getByText(/free\/vision/)).toBeVisible();
  });
});

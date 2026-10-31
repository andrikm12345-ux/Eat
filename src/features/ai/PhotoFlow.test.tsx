import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { renderApp } from '../../test/renderApp';

// The feature is switched off in the product; these tests run it with the flag on.
vi.mock('../flags', () => ({ VISION_AI_ENABLED: true }));
vi.mock('./images', () => ({
  toImageBlocks: async () => [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
  ],
}));

beforeEach(() => {
  // jsdom has no object URLs (the photo picker previews thumbnails with them).
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

const reply = (obj: unknown) =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(obj) }],
          stop_reason: 'end_turn',
        }),
        { status: 200 },
      ),
  );

async function setup() {
  await repos.settings.set(AI_KEYS.enabled, true);
  await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
  await repos.settings.set(AI_KEYS.consent, true);
}

async function pickPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    await screen.findByTestId('photo-input'),
    new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
  );
}

describe('combined photo screen (flag on)', () => {
  it('a meal photo goes to the review screen', async () => {
    await setup();
    vi.stubGlobal(
      'fetch',
      reply({
        kind: 'meal',
        meal: {
          items: [
            {
              name: 'Плов',
              grams: 300,
              per100g: { kcal: 160, protein: 6, fat: 6, carbs: 21 },
              confidence: 'medium',
              assumed: false,
              searchHint: 'плов',
            },
          ],
          mealGuess: 'обед',
          notes: '',
        },
      }),
    );
    const user = userEvent.setup();
    await renderApp('/add/ai-photo?date=2026-03-01&time=13:00');
    await pickPhoto(user);
    await user.click(screen.getByRole('button', { name: ru.ai.photo.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(await repos.entries.byDate('2026-03-01')).toHaveLength(0);
  });

  it('a label photo opens the product form and saves to My foods with the barcode', async () => {
    await setup();
    vi.stubGlobal(
      'fetch',
      reply({
        kind: 'label',
        label: {
          name: 'Кефир 1%',
          brand: 'Простоквашино',
          barcode: null,
          per100g: { kcal: 40, protein: 3, fat: 1, carbs: 4 },
          serving: null,
          confidence: 'high',
          warnings: [],
        },
      }),
    );
    const user = userEvent.setup();
    await renderApp('/add/ai-photo?barcode=4610282720266');
    await pickPhoto(user);
    await user.click(screen.getByRole('button', { name: ru.ai.photo.go }));
    expect(await screen.findByRole('heading', { name: ru.ai.photo.productTitle })).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.foods.save }));
    await waitFor(async () =>
      expect(await repos.foods.byBarcode('4610282720266')).toMatchObject({
        name: 'Кефир 1%',
        source: 'ai_label',
      }),
    );
  });

  it('shows the error with a manual way out', async () => {
    await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 401 })),
    );
    const user = userEvent.setup();
    await renderApp('/add/ai-photo');
    await pickPhoto(user);
    await user.click(screen.getByRole('button', { name: ru.ai.photo.go }));
    expect(await screen.findByText(/Ключ API не принят/)).toBeVisible();
  });
});

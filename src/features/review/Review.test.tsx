import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { useReview, withPer100, withPortionKcal, type ReviewItem } from '../../state/review';
import { renderApp } from '../../test/renderApp';

const t = ru.review;
const shake = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  key: 'k1',
  name: 'Коктейль',
  grams: 450,
  per100g: { kcal: 65, protein: 2.5, fat: 1.5, carbs: 10 },
  source: 'ai',
  confidence: 'medium',
  ...over,
});

function draft(items: ReviewItem[], notes?: string) {
  useReview.getState().setDraft({
    items,
    entrySource: 'ai_text',
    date: '2026-03-01',
    time: '08:00',
    analysis: 'ai',
    ...(notes ? { notes } : {}),
  });
}

beforeEach(() => useReview.getState().setDraft(null));

describe('review helpers', () => {
  it('portion calories set the per-100 g calories; macros stay; the item becomes manual and unlinked', () => {
    const out = withPortionKcal(shake({ foodId: 'f1' }), 300);
    expect(out.per100g).toEqual({ kcal: 66.67, protein: 2.5, fat: 1.5, carbs: 10 });
    expect(out.source).toBe('manual');
    expect(out).not.toHaveProperty('foodId');
    // Nothing to divide by without grams.
    const none = shake({ grams: 0 });
    expect(withPortionKcal(none, 300)).toBe(none);
  });

  it('per-100 g edits change only the given values', () => {
    const out = withPer100(shake({ foodId: 'f1' }), { kcal: 80, fat: 3 });
    expect(out.per100g).toEqual({ kcal: 80, protein: 2.5, fat: 3, carbs: 10 });
    expect(out.source).toBe('manual');
    expect(out).not.toHaveProperty('foodId');
  });
});

describe('review screen: portion / per 100 g', () => {
  it('starts on "Порция" and lets you set the calories of the portion by hand', async () => {
    draft([shake()]);
    const user = userEvent.setup();
    await renderApp('/review');
    expect(await screen.findByRole('radio', { name: t.modePortion })).toBeChecked();
    expect(screen.getByLabelText(`${t.portionKcal}: Коктейль`)).toHaveValue('292,5');
    const kcal = screen.getByLabelText(`${t.portionKcal}: Коктейль`);
    await user.clear(kcal);
    await user.type(kcal, '400');
    expect(kcal).toHaveValue('400');
    expect(screen.getAllByText(/400 ккал/).length).toBeGreaterThan(0);
    expect(screen.getByText(t.source.manual)).toBeVisible();
    // Changing the grams keeps the new per-100 g calories.
    await user.click(screen.getByRole('button', { name: `${ru.portion.minus}: Коктейль` }));
    await waitFor(() => expect(screen.getAllByText(/391 ккал/).length).toBeGreaterThan(0));
  });

  it('"На 100 г" shows the per-100 g values and edits them', async () => {
    draft([shake()]);
    const user = userEvent.setup();
    await renderApp('/review');
    await user.click(await screen.findByRole('radio', { name: t.mode100 }));
    expect(screen.getByLabelText(t.per100Aria(t.per100.kcal, 'Коктейль'))).toHaveValue('65');
    expect(screen.getByLabelText(t.per100Aria(t.per100.protein, 'Коктейль'))).toHaveValue('2,5');
    const kcal = screen.getByLabelText(t.per100Aria(t.per100.kcal, 'Коктейль'));
    await user.clear(kcal);
    expect(kcal).toHaveValue('');
    await user.type(kcal, '100');
    // 100 kcal/100 g · 450 g
    await waitFor(() => expect(screen.getAllByText(/450 ккал/).length).toBeGreaterThan(0));
    await user.click(screen.getByRole('radio', { name: t.modePortion }));
    expect(screen.getByLabelText(`${t.portionKcal}: Коктейль`)).toHaveValue('450');
  });

  it('each item has its own mode', async () => {
    draft([shake(), shake({ key: 'k2', name: 'Банан' })]);
    const user = userEvent.setup();
    await renderApp('/review');
    const second = await screen.findByRole('radiogroup', { name: `${t.modeLabel}: Банан` });
    await user.click(second.querySelector('[role=radio]:last-child') as HTMLElement);
    expect(screen.getByLabelText(t.per100Aria(t.per100.kcal, 'Банан'))).toBeVisible();
    expect(
      screen.queryByLabelText(t.per100Aria(t.per100.kcal, 'Коктейль')),
    ).not.toBeInTheDocument();
  });

  it('saves the hand-edited values to the diary', async () => {
    draft([shake()]);
    const user = userEvent.setup();
    await renderApp('/review');
    const kcal = await screen.findByLabelText(`${t.portionKcal}: Коктейль`);
    await user.clear(kcal);
    await user.type(kcal, '300');
    await user.click(screen.getByRole('button', { name: t.save }));
    await waitFor(async () => expect(await repos.entries.byDate('2026-03-01')).toHaveLength(1));
    const [e] = await repos.entries.byDate('2026-03-01');
    expect(Math.round(e!.items[0]!.nutrients.kcal)).toBe(300);
    expect(e!.items[0]!.grams).toBe(450);
  });
});

describe('review screen: clarify with the AI and remember corrections', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the remark, replaces the items with the new estimate', async () => {
    await repos.settings.set(AI_KEYS.enabled, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.consent, true);
    const redo = {
      items: [
        {
          name: 'Треугольник без сыра',
          grams: 250,
          per100g: { kcal: 200, protein: 10, fat: 6, carbs: 28 },
          confidence: 'medium',
          assumed: false,
          searchHint: 'треугольник без сыра',
        },
      ],
      mealGuess: 'обед',
      notes: 'Без сыра, как вы сказали',
    };
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(redo) }],
            stop_reason: 'end_turn',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', f);
    draft([shake()], 'Старое описание блюда');
    const user = userEvent.setup();
    await renderApp('/review');
    expect(await screen.findByText('Старое описание блюда')).toBeVisible();
    expect(await screen.findByRole('button', { name: t.clarifyGo })).toBeDisabled();
    await user.type(screen.getByLabelText(t.clarifyLabel), 'сыра внутри нет');
    await user.click(screen.getByRole('button', { name: t.clarifyGo }));
    expect(await screen.findByText('Треугольник без сыра')).toBeVisible();
    expect(screen.queryByText('Коктейль')).not.toBeInTheDocument();
    // The description under the total follows the new estimate.
    expect(screen.getByText('Без сыра, как вы сказали')).toBeVisible();
    expect(screen.queryByText('Старое описание блюда')).not.toBeInTheDocument();
    const body = JSON.stringify(f.mock.calls[0]);
    expect(body).toContain('сыра внутри нет');
    expect(body).toContain('Коктейль');
  });

  it('shows the error when the AI cannot recalculate', async () => {
    await repos.settings.set(AI_KEYS.enabled, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
    await repos.settings.set(AI_KEYS.consent, true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 401 })),
    );
    draft([shake()]);
    const user = userEvent.setup();
    await renderApp('/review');
    await user.type(await screen.findByLabelText(t.clarifyLabel), 'меньше масла');
    await user.click(screen.getByRole('button', { name: t.clarifyGo }));
    expect(await screen.findByText(/Не удалось пересчитать/)).toBeVisible();
    expect(screen.getByText('Коктейль')).toBeVisible();
  });

  it('is not offered without AI, and the remember switch appears after a manual correction', async () => {
    draft([shake()]);
    const user = userEvent.setup();
    await renderApp('/review');
    await screen.findByText('Коктейль');
    expect(screen.queryByText(t.clarifyTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: t.remember })).not.toBeInTheDocument();
    const kcal = screen.getByLabelText(`${t.portionKcal}: Коктейль`);
    await user.clear(kcal);
    await user.type(kcal, '400');
    expect(await screen.findByRole('switch', { name: t.remember })).toBeChecked();
    await user.click(screen.getByRole('button', { name: t.save }));
    await waitFor(async () =>
      expect((await repos.foods.list()).some((x) => x.name === 'Коктейль')).toBe(true),
    );
  });
});

describe('review screen: pieces', () => {
  it('opens in pieces for a countable product and recalculates from the piece weight', async () => {
    draft([shake({ name: 'Сметанник', grams: 120, piece: { grams: 60 } })]);
    const user = userEvent.setup();
    await renderApp('/review');
    expect(await screen.findByRole('radio', { name: t.modePieces })).toBeChecked();
    const count = screen.getByLabelText(`${t.piecesLabel}: Сметанник`);
    expect(count).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: `${ru.portion.plus}: Сметанник` }));
    expect(count).toHaveValue('3');
    expect(screen.getByLabelText(`${t.portionKcal}: Сметанник`)).toHaveValue('117');
    await user.click(screen.getByRole('button', { name: `${ru.portion.minus}: Сметанник` }));
    const weight = screen.getByLabelText(`${t.pieceWeight}: Сметанник`);
    await user.clear(weight);
    await user.type(weight, '45');
    expect(screen.getByLabelText(`${t.portionKcal}: Сметанник`)).toHaveValue('58,5');
    // Grams view shows the same total.
    await user.click(screen.getByRole('radio', { name: t.modeGrams }));
    expect(screen.getByLabelText(`${ru.portion.grams}: Сметанник`)).toHaveValue('90');
  });

  it('a product without pieces keeps the old portion / per 100 g choice', async () => {
    draft([shake()]);
    await renderApp('/review');
    expect(await screen.findByRole('radio', { name: t.modePortion })).toBeChecked();
    expect(screen.queryByRole('radio', { name: t.modePieces })).not.toBeInTheDocument();
  });
});

describe('drinks and what the AI took for granted', () => {
  const tea = (): ReviewItem =>
    shake({
      key: 'tea',
      name: 'Чай (заваренный)',
      grams: 250,
      per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      assumption: 'без сахара',
    });

  it('shows the assumption on the card', async () => {
    draft([tea()]);
    await renderApp('/review');
    expect(await screen.findByText(/предположено: без сахара/)).toBeVisible();
    expect(screen.getByText(t.drinkAsk)).toBeVisible();
  });

  it('"+ 2 ложки" adds a separate sugar line, the total follows and the assumption is gone', async () => {
    draft([tea()]);
    const user = userEvent.setup();
    await renderApp('/review');
    await user.click(await screen.findByRole('radio', { name: t.sugar2 }));
    expect(await screen.findByText('Сахар')).toBeVisible();
    expect(screen.queryByText(/предположено: без сахара/)).not.toBeInTheDocument();
    // 10 g of sugar = 39.9 kcal
    await waitFor(() =>
      expect(screen.getByText(/^Итого:/).querySelector('b')).toHaveTextContent(/^40\s*ккал$/),
    );
  });

  it('"Без сахара" only confirms the guess; a non-drink has no add-ons', async () => {
    draft([tea(), shake({ key: 's', name: 'Гречка' })]);
    const user = userEvent.setup();
    await renderApp('/review');
    await user.click(await screen.findByRole('radio', { name: t.noSugar }));
    expect(screen.queryByText(/предположено: без сахара/)).not.toBeInTheDocument();
    // One drink, one set of add-ons.
    expect(screen.getAllByRole('radio', { name: t.milk })).toHaveLength(1);
  });
});

describe('the AI answer that arrives after the quick catalog result', () => {
  it('offers the AI estimate and replaces the list when taken', async () => {
    useReview.getState().setDraft({
      items: [shake({ key: 'q', name: 'Быстрый разбор', source: 'catalog' })],
      entrySource: 'manual',
      date: '2026-03-01',
      time: '08:00',
      analysis: 'local',
    });
    const user = userEvent.setup();
    await renderApp('/review');
    expect(await screen.findByText('Быстрый разбор')).toBeVisible();
    expect(screen.queryByText(t.upgradeGo)).not.toBeInTheDocument();
    // The AI finishes later.
    useReview.getState().setUpgrade({
      items: [shake({ key: 'a', name: 'Оценка ИИ-разбора' })],
      entrySource: 'ai_text',
      date: '2026-03-01',
      time: '08:00',
      analysis: 'ai',
      aiRunId: 'run1',
    });
    await user.click(await screen.findByRole('button', { name: t.upgradeGo }));
    expect(await screen.findByText('Оценка ИИ-разбора')).toBeVisible();
    expect(screen.queryByText('Быстрый разбор')).not.toBeInTheDocument();
    expect(screen.queryByText(t.upgradeGo)).not.toBeInTheDocument();
    expect(useReview.getState().upgrade).toBeNull();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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

function draft(items: ReviewItem[]) {
  useReview.getState().setDraft({
    items,
    entrySource: 'ai_text',
    date: '2026-03-01',
    time: '08:00',
    analysis: 'ai',
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

import { beforeEach, describe, expect, it } from 'vitest';
import { validateMeal } from '../ai/validators';
import { repos } from '../db/repos';
import type { ReviewDraft } from '../state/review';
import { clarifyMessage } from './aiClarify';
import { mealToDraft, PIECE_LABEL } from './aiFood';
import { saveReview } from './review';

const item = (over: Record<string, unknown> = {}) => ({
  name: 'Сметанник мини',
  grams: 120,
  per100g: { kcal: 267, protein: 2, fat: 15, carbs: 31 },
  confidence: 'medium',
  assumed: false,
  searchHint: 'сметанник мини',
  ...over,
});
const at = { date: '2026-03-01', time: '12:00' };
const meta = { entrySource: 'ai_text' as const, aiRunId: 'r1' };

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
});

describe('pieces in the AI answer', () => {
  it('keeps valid pieces, drops broken or half-given ones without failing the answer', () => {
    const ok = validateMeal({ items: [item({ pieces: 2, pieceGrams: 60 })] });
    expect(ok.ok && ok.value.items[0]).toMatchObject({ pieces: 2, pieceGrams: 60 });
    for (const bad of [
      { pieces: 2 },
      { pieceGrams: 60 },
      { pieces: 0, pieceGrams: 60 },
      { pieces: 2, pieceGrams: 5000 },
      { pieces: '2', pieceGrams: 60 },
      { pieces: null, pieceGrams: null },
    ]) {
      const v = validateMeal({ items: [item(bad)] });
      expect(v.ok).toBe(true);
      expect(v.ok && v.value.items[0]).not.toHaveProperty('pieces');
    }
  });
});

describe('mealToDraft with pieces', () => {
  const draftOf = async (over: Record<string, unknown>) => {
    const v = validateMeal({ items: [item(over)] });
    if (!v.ok) throw new Error('invalid');
    return mealToDraft(repos, v.value, at, meta);
  };

  it('grams follow pieces × weight of one piece', async () => {
    const d = await draftOf({ grams: 100, pieces: 2, pieceGrams: 60 });
    expect(d.items[0]).toMatchObject({ grams: 120, piece: { grams: 60 } });
  });

  it('without pieces nothing changes', async () => {
    const d = await draftOf({});
    expect(d.items[0]?.grams).toBe(120);
    expect(d.items[0]).not.toHaveProperty('piece');
  });

  it('prefers the weight of "1 шт" the user saved with the product', async () => {
    await repos.foods.add({
      name: 'Сметанник мини',
      per100g: { kcal: 250, protein: 3, fat: 14, carbs: 30 },
      servings: [{ label: PIECE_LABEL, grams: 45 }],
      source: 'user',
      verified: true,
    });
    const d = await draftOf({ pieces: 2, pieceGrams: 60 });
    expect(d.items[0]).toMatchObject({ source: 'catalog', grams: 90, piece: { grams: 45 } });
  });
});

describe('remembering a corrected piece weight', () => {
  const draft = (grams: number, pieceGrams: number): ReviewDraft => ({
    items: [
      {
        key: 'k1',
        name: 'Сметанник мини',
        grams,
        per100g: { kcal: 267, protein: 2, fat: 15, carbs: 31 },
        source: 'manual',
        piece: { grams: pieceGrams },
      },
    ],
    entrySource: 'ai_text',
    ...at,
  });

  it('the new food gets a "1 шт" serving, a repeat updates it', async () => {
    await saveReview(draft(100, 50), { remember: new Set(['k1']) });
    let f = (await repos.foods.list()).find((x) => x.name === 'Сметанник мини');
    expect(f?.servings).toEqual([{ label: PIECE_LABEL, grams: 50 }]);
    await saveReview(draft(110, 55), { remember: new Set(['k1']) });
    f = (await repos.foods.list()).find((x) => x.name === 'Сметанник мини');
    expect(f?.servings).toEqual([{ label: PIECE_LABEL, grams: 55 }]);
  });

  it('keeps other servings and servings of a food whose item has no piece', async () => {
    const food = await repos.foods.add({
      name: 'Сметанник мини',
      per100g: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
      servings: [{ label: 'порция', grams: 200 }],
      source: 'user',
      verified: true,
    });
    await saveReview(draft(100, 50), { remember: new Set(['k1']) });
    let f = await repos.foods.get(food.id);
    expect(f?.servings).toEqual([
      { label: 'порция', grams: 200 },
      { label: PIECE_LABEL, grams: 50 },
    ]);
    const noPiece = draft(100, 50);
    delete noPiece.items[0]!.piece;
    await saveReview(noPiece, { remember: new Set(['k1']) });
    f = await repos.foods.get(food.id);
    expect(f?.servings).toHaveLength(2);
  });
});

describe('clarify message with pieces', () => {
  it('tells the AI how many pieces and what one weighs', () => {
    const m = clarifyMessage(
      [
        {
          key: 'k',
          name: 'Сметанник',
          grams: 120,
          per100g: { kcal: 267, protein: 2, fat: 15, carbs: 31 },
          source: 'ai',
          piece: { grams: 60 },
        },
      ],
      'вес штуки 50 г',
    );
    expect(m).toContain('"pieces":2');
    expect(m).toContain('"pieceGrams":60');
  });
});

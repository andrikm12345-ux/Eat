import { describe, expect, it } from 'vitest';
import { PROMPT_PHOTO } from './prompts';
import { validatePhoto } from './validators';

const meal = {
  items: [
    {
      name: 'Гречка',
      grams: 180,
      per100g: { kcal: 92, protein: 3.4, fat: 0.6, carbs: 20 },
      confidence: 'high',
      assumed: false,
      searchHint: 'гречка',
    },
  ],
  mealGuess: 'обед',
  notes: '',
};
const label = {
  name: 'Кефир',
  brand: null,
  barcode: null,
  per100g: { kcal: 59, protein: 3, fat: 3.2, carbs: 4.5 },
  serving: null,
  confidence: 'high',
  warnings: [],
};

describe('combined photo answer', () => {
  it('accepts a meal and a label, tells them apart', () => {
    const m = validatePhoto({ kind: 'meal', meal });
    expect(m.ok && m.value.kind).toBe('meal');
    const l = validatePhoto({ kind: 'label', label });
    expect(l.ok && l.value.kind).toBe('label');
  });
  it('rejects unknown kinds, broken payloads and non-objects with useful paths', () => {
    expect(validatePhoto({ kind: 'recipe' })).toEqual({
      ok: false,
      errors: ['kind: нужно "meal" или "label"'],
    });
    const bad = validatePhoto({ kind: 'label', label: { per100g: 'x', confidence: 'q' } });
    expect(!bad.ok && bad.errors[0]).toMatch(/^label\./);
    const bad2 = validatePhoto({ kind: 'meal', meal: { items: [] } });
    expect(!bad2.ok && bad2.errors[0]).toMatch(/^meal\./);
    expect(validatePhoto('x').ok).toBe(false);
  });
  it('the prompt covers both cases and the output envelope', () => {
    expect(PROMPT_PHOTO).toContain('"kind":"label"');
    expect(PROMPT_PHOTO).toContain('"kind":"meal"');
  });
});

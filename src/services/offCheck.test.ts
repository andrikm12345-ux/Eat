import { describe, expect, it } from 'vitest';
import { checkLabelWithOff, isValidEan, sameNutrition } from './offCheck';

const n = (kcal: number, protein: number, fat: number, carbs: number) => ({
  kcal,
  protein,
  fat,
  carbs,
});
const draft = (barcode: string | undefined, per100g = n(69.6, 2.9, 2, 10)) => ({
  name: 'Коктейль',
  ...(barcode ? { barcode } : {}),
  per100g,
  servings: [],
});
const offReply = (nutriments: Record<string, number>) =>
  (async () =>
    new Response(
      JSON.stringify({
        status: 1,
        product: { code: '4810268055577', product_name: 'x', nutriments },
      }),
    )) as unknown as typeof fetch;

describe('barcode check digit', () => {
  it('accepts real codes and rejects a misread digit', () => {
    expect(isValidEan('4810268055577')).toBe(true);
    expect(isValidEan('4810268055576')).toBe(false);
    expect(isValidEan('123')).toBe(false);
    expect(isValidEan('48102680555ab')).toBe(false);
  });
});

describe('label vs Open Food Facts', () => {
  it('rounding differences are the same, a real gap is not', () => {
    expect(sameNutrition(n(69.6, 2.9, 2, 10), n(70, 3, 2, 10.2))).toBe(true);
    expect(sameNutrition(n(69.6, 2.9, 2, 10), n(59, 2.7, 2, 7.5))).toBe(false);
  });

  it('does nothing without a valid barcode', async () => {
    expect(await checkLabelWithOff(draft(undefined))).toBeNull();
    expect(await checkLabelWithOff(draft('4810268055576'))).toBeNull();
  });

  it('does nothing when the database has the product but no nutrition', async () => {
    expect(
      await checkLabelWithOff(draft('4810268055577'), { fetchImpl: offReply({}), online: true }),
    ).toBeNull();
  });

  it('confirms matching values and offers the database values when they differ', async () => {
    const same = await checkLabelWithOff(draft('4810268055577'), {
      online: true,
      fetchImpl: offReply({
        'energy-kcal_100g': 70,
        proteins_100g: 2.9,
        fat_100g: 2,
        carbohydrates_100g: 10,
      }),
    });
    expect(same?.note).toContain('совпали');
    expect(same?.alt).toBeUndefined();

    const differ = await checkLabelWithOff(draft('4810268055577', n(59, 2.7, 2, 7.5)), {
      online: true,
      fetchImpl: offReply({
        'energy-kcal_100g': 69.6,
        proteins_100g: 2.9,
        fat_100g: 2,
        carbohydrates_100g: 10,
      }),
    });
    expect(differ?.note).toContain('Open Food Facts');
    expect(differ?.alt?.kcal).toBeCloseTo(69.6);
  });

  it('offline or an error never blocks', async () => {
    expect(await checkLabelWithOff(draft('4810268055577'), { online: false })).toBeNull();
  });
});

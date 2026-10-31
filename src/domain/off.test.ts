import { describe, expect, it } from 'vitest';
import { bare, crackers, kefir, missing } from './__fixtures__/off';
import { mapOffNutriments, mapOffProduct } from './off';

describe('Open Food Facts mapping', () => {
  it('maps a full Russian product', () => {
    expect(mapOffProduct(kefir, '4607025392408')).toEqual({
      name: 'Кефир 3,2%',
      brand: 'Простоквашино',
      barcode: '4607025392408',
      per100g: {
        kcal: 59,
        protein: 3,
        fat: 3.2,
        carbs: 4.5,
        sugar: 4.5,
        salt: 0.1,
        sodium: 40,
        calcium: 120,
      },
      servings: [{ label: '1 стакан (250 мл)', grams: 250 }],
    });
  });

  it('converts kJ, parses string numbers and falls back on names', () => {
    const d = mapOffProduct(crackers, '123');
    expect(d?.name).toBe('Crackers');
    expect(d?.barcode).toBe('123');
    expect(d?.brand).toBeUndefined();
    expect(d?.servings).toEqual([]);
    expect(d?.per100g.kcal).toBeCloseTo(1900 / 4.184, 2);
    expect(d?.per100g).toMatchObject({
      protein: 9.5,
      fat: 18,
      carbs: 65,
      sodium: 400,
      salt: 1,
      vitC: 10,
      vitD: 2.5,
    });
    expect(d?.per100g.fiber).toBeUndefined();
  });

  it('names a serving without a label', () => {
    expect(
      mapOffProduct({ status: 1, product: { product_name: 'X', serving_quantity: 30 } }, '9')
        ?.servings,
    ).toEqual([{ label: 'порция', grams: 30 }]);
  });

  it('returns null for unknown products', () => {
    expect(mapOffProduct(missing, '0000000000000')).toBeNull();
    expect(mapOffProduct({ status: 1 }, '1')).toBeNull();
  });

  it('handles a bare product (Atwater kcal = 0, generic name)', () => {
    expect(mapOffProduct(bare, '42')).toEqual({
      name: 'Продукт 42',
      barcode: '42',
      per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      servings: [],
    });
  });

  it('uses legacy energy_100g (kJ) and computes kcal from macros if no energy', () => {
    expect(mapOffNutriments({ energy_100g: 418.4 }).kcal).toBeCloseTo(100);
    expect(mapOffNutriments({ proteins_100g: 10, fat_100g: 10, carbohydrates_100g: 10 }).kcal).toBe(
      170,
    );
    expect(mapOffNutriments({ proteins_100g: -1 }).protein).toBe(0);
  });
});

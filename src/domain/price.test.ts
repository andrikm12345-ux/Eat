import { describe, expect, it } from 'vitest';
import { formatRub, knownStores, portionPrice, pricePer100g } from './price';

describe('price', () => {
  it('per 100 g from a pack, a kilo and 100 g', () => {
    expect(pricePer100g(90, 450)).toBeCloseTo(20);
    expect(pricePer100g(300, 1000)).toBeCloseTo(30);
    expect(pricePer100g(25, 100)).toBeCloseTo(25);
  });
  it('is null without a price or its weight', () => {
    expect(pricePer100g(undefined, 100)).toBeNull();
    expect(pricePer100g(0, 100)).toBeNull();
    expect(pricePer100g(50, undefined)).toBeNull();
    expect(pricePer100g(50, 0)).toBeNull();
  });
  it('price of a portion', () => {
    expect(portionPrice(300, 1000, 200)).toBeCloseTo(60);
    expect(portionPrice(undefined, undefined, 200)).toBeNull();
  });
  it('formats roubles', () => {
    expect(formatRub(12.34)).toBe('12,3 ₽');
    expect(formatRub(89.6)).toBe('89,6 ₽');
    expect(formatRub(120.4)).toBe('120 ₽');
  });
  it('shops, most frequent first, without blanks', () => {
    const foods = [
      { store: 'Магнит' },
      { store: 'Пятёрочка' },
      { store: ' Магнит ' },
      {},
      { store: '' },
    ];
    expect(knownStores(foods)).toEqual(['Магнит', 'Пятёрочка']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseMealText, parsePart, resolveGrams, splitMeal } from './mealText';

describe('meal text parsing', () => {
  it('splits a description into parts', () => {
    expect(splitMeal('овсянка 60 г на молоке 200 мл, банан, кофе с молоком')).toEqual([
      'овсянка 60 г на молоке 200 мл',
      'банан',
      'кофе с молоком',
    ]);
    expect(splitMeal('хлеб и масло + сыр; чай\nяйцо плюс кофе')).toEqual([
      'хлеб',
      'масло',
      'сыр',
      'чай',
      'яйцо',
      'кофе',
    ]);
  });

  it('extracts grams, volumes and units', () => {
    expect(parsePart('гречка 150 г')).toMatchObject({ query: 'гречка', grams: 150, count: null });
    expect(parsePart('200 гр творога')).toMatchObject({ query: 'творога', grams: 200 });
    expect(parsePart('молоко 0,5 л')).toMatchObject({ query: 'молоко', grams: 500 });
    expect(parsePart('кефир 250 мл')).toMatchObject({ query: 'кефир', grams: 250 });
    expect(parsePart('сыр 0.1 кг')).toMatchObject({ grams: 100 });
    expect(parsePart('2 ст.л. сахара')).toMatchObject({ query: 'сахара', grams: 30 });
    expect(parsePart('сахар 1 ч.л.')).toMatchObject({ query: 'сахар', grams: 5 });
    expect(parsePart('чай 2 стакана')).toMatchObject({ query: 'чай', grams: 500 });
    expect(parsePart('кофе 1 чашка')).toMatchObject({ query: 'кофе', grams: 240 });
    expect(parsePart('овсянка 60 г на молоке 200 мл')).toMatchObject({
      query: 'овсянка на молоке 200 мл',
      grams: 60,
    });
  });

  it('counts pieces and keeps percentages in the name', () => {
    expect(parsePart('2 яйца')).toMatchObject({ query: 'яйца', grams: null, count: 2 });
    expect(parsePart('банан 1 шт')).toMatchObject({ query: 'банан', count: 1 });
    expect(parsePart('3 куска хлеба')).toMatchObject({ query: 'хлеба', count: 3 });
    expect(parsePart('творог 5%')).toMatchObject({ query: 'творог 5%', grams: null, count: null });
    expect(parsePart('молоко 3,2 % 200 мл')).toMatchObject({ query: 'молоко 3,2 %', grams: 200 });
    expect(parsePart('2 гречки')).toMatchObject({ count: 2, query: 'гречки' });
  });

  it('drops filler words and rejects empty fragments', () => {
    expect(parsePart('примерно немного борща')).toMatchObject({ query: 'борща' });
    expect(parsePart('съел пиццу')).toMatchObject({ query: 'пиццу' });
    expect(parsePart('150')).toBeNull();
    expect(parsePart('г')).toBeNull();
    expect(parsePart('0 г хлеба')).toMatchObject({ query: '0 г хлеба' });
    expect(parseMealText('  ,  ; ')).toEqual([]);
  });

  it('resolves grams from servings / last used / default', () => {
    const egg = { servings: [{ label: 'шт', grams: 50 }], lastGrams: undefined };
    expect(resolveGrams({ grams: 120.04, count: null }, egg)).toBe(120);
    expect(resolveGrams({ grams: null, count: 2 }, egg)).toBe(100);
    expect(resolveGrams({ grams: null, count: 2 }, { servings: [] })).toBe(200);
    expect(
      resolveGrams(
        { grams: null, count: null },
        { servings: [{ label: 'пачка', grams: 180 }], lastGrams: undefined },
      ),
    ).toBe(180);
    expect(resolveGrams({ grams: null, count: null }, { servings: [], lastGrams: 75 })).toBe(75);
    expect(resolveGrams({ grams: null, count: null }, { servings: [] })).toBe(100);
  });

  it('understands numbers written in words', () => {
    expect(parsePart('два яйца')).toMatchObject({ query: 'яйца', count: 2 });
    expect(parsePart('три сырника')).toMatchObject({ query: 'сырника', count: 3 });
    expect(parsePart('полтора банана')).toMatchObject({ query: 'банана', count: 1.5 });
    // A number word that is not before a food word stays as it is.
    expect(parsePart('три')).toMatchObject({ query: 'три', count: null });
    expect(parsePart('борщ')).toMatchObject({ query: 'борщ', count: null, grams: null });
  });

  it('a bare decimal after a drink is litres, after food it is pieces', () => {
    expect(parsePart('пиво 0,5')).toMatchObject({ query: 'пиво', grams: 500, count: null });
    expect(parsePart('1,5 молока')).toMatchObject({ grams: 1500 });
    expect(parsePart('0,5 пиццы')).toMatchObject({ query: 'пиццы', grams: null, count: 0.5 });
    // A whole number without a unit stays a count.
    expect(parsePart('2 пива')).toMatchObject({ count: 2, grams: null });
  });
});

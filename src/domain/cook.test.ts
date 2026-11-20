import { describe, expect, it } from 'vitest';
import {
  checkDish,
  isBasic,
  matchDistance,
  parsePantry,
  pickDishes,
  productKey,
  rejectReason,
  amountText,
  withPieces,
  sameDish,
  type CookFilters,
  type DishIdea,
  type DishIngredient,
} from './cook';

const n = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs });
const ing = (name: string, grams: number, extra: Partial<DishIngredient> = {}): DishIngredient => ({
  name,
  grams,
  per100g: n(100, 5),
  ...extra,
});
const dish = (name: string, ingredients: DishIngredient[], minutes = 20): DishIdea => ({
  name,
  minutes,
  difficulty: 'easy',
  ingredients,
});
const F: CookFilters = { maxMinutes: null, noBuy: false, basics: true, servings: 1 };
const same = (a: string, b: string) => matchDistance(productKey(a), productKey(b)) !== null;

describe('what is the same product', () => {
  it('forms of words, order and synonyms', () => {
    expect(same('куриное филе', 'курица')).toBe(true);
    expect(same('Курица', 'куриная грудка')).toBe(true);
    expect(same('куриная грудка', 'куриное филе')).toBe(true);
    expect(same('Помидоры', 'томат')).toBe(true);
    expect(same('картошка', 'Картофель')).toBe(true);
    expect(same('Яйцо куриное', 'яйца')).toBe(true);
    expect(same('Лук репчатый', 'лук')).toBe(true);
    expect(same('луковица', 'лук')).toBe(true);
    expect(same('Сыр твёрдый', 'сыр гауда')).toBe(true);
    expect(same('Спагетти', 'макароны')).toBe(true);
    expect(same('Масло подсолнечное', 'растительное масло')).toBe(true);
    expect(same('Гречневая крупа', 'гречка')).toBe(true);
    expect(same('Шампиньоны', 'грибы')).toBe(true);
    expect(same('Рис круглозёрный', 'рис')).toBe(true);
  });

  it('another product with the same word is not a match', () => {
    expect(same('Масло сливочное', 'масло растительное')).toBe(false);
    expect(same('Масло сливочное', 'масло')).toBe(false);
    expect(same('Кокосовое молоко', 'молоко')).toBe(false);
    expect(same('Сыр плавленый', 'сыр')).toBe(false);
    expect(same('Цветная капуста', 'капуста')).toBe(false);
    expect(same('Зелёный лук', 'лук')).toBe(false);
    expect(same('Томатная паста', 'макароны')).toBe(false);
    expect(same('Томатная паста', 'помидоры')).toBe(false);
    expect(same('Рисовая лапша', 'макароны')).toBe(false);
    expect(same('Грудка индейки', 'куриная грудка')).toBe(false);
    expect(same('Яичная лапша', 'яйца')).toBe(false);
    // "сырой" is not cheese
    expect(same('Рис сырой', 'сыр')).toBe(false);
    expect(same('говядина', 'свинина')).toBe(false);
  });

  it('a recipe asking in general is covered by a specific product at home', () => {
    expect(same('Масло', 'масло сливочное')).toBe(true);
    expect(same('Сыр', 'сыр плавленый')).toBe(true);
  });

  it('basics', () => {
    for (const b of [
      'Соль',
      'соль по вкусу',
      'Перец чёрный молотый',
      'Сахар',
      'Вода',
      'Масло растительное',
      'Масло подсолнечное для жарки',
      'Лавровый лист',
      'Паприка',
      'Специи по вкусу',
    ])
      expect(isBasic(b), b).toBe(true);
    for (const b of ['Масло сливочное', 'Перец болгарский', 'Сахарная пудра', 'Сливки', 'Молоко'])
      expect(isBasic(b), b).toBe(false);
  });
});

describe('the pantry', () => {
  it('reads amounts and joins the same product said twice', () => {
    expect(parsePantry('курица 500 г, 2 яйца, лук, рис 1 кг и ещё яйца 3 шт')).toEqual([
      { name: 'курица', grams: 500, count: null },
      { name: 'яйца', grams: null, count: 5 },
      { name: 'лук', grams: null, count: null },
      { name: 'рис', grams: 1000, count: null },
    ]);
  });
});

describe('checking a dish', () => {
  const pantry = parsePantry('куриное филе 300 г, рис, лук, морковь, 2 яйца');
  const plov = dish('Плов с курицей', [
    ing('Рис', 80),
    ing('Курица', 150),
    ing('Морковь', 50),
    ing('Лук репчатый', 40),
    ing('Масло растительное', 10),
    ing('Соль', 2),
    ing('Зелень', 5, { optional: true }),
  ]);

  it('everything there: basics and optional herbs do not count as missing', () => {
    const d = checkDish(plov, pantry, F);
    expect(d.missing).toEqual([]);
    expect(d.short).toEqual([]);
    expect(d.main).toBe('Курица');
    expect(d.usedPantry).toBe(4);
    expect(d.haveShare).toBe(1);
    expect(d.ingredients.map((i) => i.status)).toEqual([
      'have',
      'have',
      'have',
      'have',
      'basic',
      'basic',
      'optional',
    ]);
  });

  it('amounts: 2 servings need 300 g of chicken (there is 300 g), 3 servings do not fit', () => {
    expect(checkDish(plov, pantry, { ...F, servings: 2 }).short).toEqual([]);
    expect(checkDish(plov, pantry, { ...F, servings: 3 }).short).toEqual(['Курица']);
    const omelet = dish('Омлет', [ing('Яйцо', 110, { pieces: 2, pieceGrams: 55 })]);
    expect(checkDish(omelet, pantry, F).short).toEqual([]);
    expect(checkDish(omelet, pantry, { ...F, servings: 2 }).short).toEqual(['Яйцо']);
  });

  it('without the basics switched on, salt has to be at home too', () => {
    expect(checkDish(plov, pantry, { ...F, basics: false }).missing).toEqual([
      'Масло растительное',
      'Соль',
    ]);
  });

  it('a dish without its main ingredient is not offered', () => {
    const borsch = dish('Борщ', [
      ing('Свёкла', 120),
      ing('Капуста', 100),
      ing('Говядина', 150),
      ing('Морковь', 40),
      ing('Лук', 30),
    ]);
    const d = checkDish(borsch, pantry, F);
    expect(d.main).toBe('Говядина');
    expect(rejectReason(d, F)).toBe('main');
  });

  it('too much to buy, nothing to buy, nothing used, too long', () => {
    const many = dish('Салат', [
      ing('Курица', 100),
      ing('Огурец', 60),
      ing('Помидор', 60),
      ing('Сыр', 30),
    ]);
    expect(rejectReason(checkDish(many, pantry, F), F)).toBe('tooMany');
    const oneMissing = dish('Курица с сыром', [ing('Курица', 150), ing('Сыр', 30)]);
    expect(rejectReason(checkDish(oneMissing, pantry, F), F)).toBeNull();
    expect(rejectReason(checkDish(oneMissing, pantry, F), { ...F, noBuy: true })).toBe('noBuy');
    const none = dish('Блины', [ing('Мука', 100), ing('Молоко', 200)]);
    expect(rejectReason(checkDish(none, pantry, F), F)).toBe('unused');
    expect(rejectReason(checkDish(plov, pantry, F), { ...F, maxMinutes: 15 })).toBe('time');
  });
});

describe('ranking', () => {
  const pantry = parsePantry('курица 500 г, рис, яйца 4 шт, помидоры, сыр');
  const ideas = [
    dish('Курица с рисом', [ing('Курица', 150), ing('Рис', 80)], 35),
    dish('Омлет с помидорами', [ing('Яйцо', 110, { pieces: 2 }), ing('Помидор', 80)], 10),
    dish('Омлет', [ing('Яйцо', 110, { pieces: 2 })], 10),
    dish('Курица в сливках', [ing('Курица', 150), ing('Сливки', 100)], 30),
    dish('Борщ', [ing('Свёкла', 100), ing('Говядина', 150)], 90),
  ];
  const kcal = (i: DishIdea) =>
    n(
      i.ingredients.reduce((s, x) => s + x.grams, 0),
      10,
    );

  it('dishes with everything at home come first, a repeat and a dish without its base are dropped', () => {
    const { shown, rejected } = pickDishes(ideas, pantry, F, null, kcal);
    expect(shown.map((d) => d.idea.name)).toEqual([
      'Омлет с помидорами',
      'Курица с рисом',
      'Курица в сливках',
    ]);
    expect(rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Борщ', reason: 'unused' }),
        expect.objectContaining({ name: 'Омлет', reason: 'duplicate' }),
      ]),
    );
  });

  it('a dish over what is left of the day goes down', () => {
    const big = (i: DishIdea) => (i.name === 'Курица с рисом' ? n(900, 40) : n(300, 20));
    const { shown } = pickDishes(ideas, pantry, F, { kcal: 500, protein: 30 }, big);
    expect(shown.map((d) => d.idea.name).indexOf('Курица с рисом')).toBeGreaterThan(0);
  });
});

describe('the same dish twice', () => {
  const d = (name: string, ings: string[]) =>
    dish(
      name,
      ings.map((x) => ing(x, 100)),
    );
  const syrniki = d('Творожные сырники с бананом', ['Творог', 'Банан', 'Мука', 'Яйцо']);
  it('one dish under two names', () => {
    expect(sameDish(syrniki, d('Сырники со сметаной', ['Творог', 'Мука', 'Яйцо', 'Сметана']))).toBe(
      true,
    );
    expect(sameDish(d('Омлет', ['Яйцо']), d('Омлет с помидорами', ['Яйцо', 'Помидор']))).toBe(true);
    expect(sameDish(d('Плов с курицей', ['Курица', 'Рис']), d('Плов', ['Рис', 'Говядина']))).toBe(
      true,
    );
  });
  it('different dishes from the same products', () => {
    expect(
      sameDish(syrniki, d('Творожная запеканка с бананом', ['Творог', 'Банан', 'Яйцо', 'Мука'])),
    ).toBe(false);
    expect(sameDish(syrniki, d('Ленивые вареники', ['Творог', 'Мука', 'Яйцо']))).toBe(false);
    expect(
      sameDish(
        d('Рис с овощами и яйцом', ['Рис', 'Морковь', 'Яйцо']),
        d('Куриное филе с рисом и овощами', ['Куриное филе', 'Рис', 'Морковь']),
      ),
    ).toBe(false);
    expect(sameDish(d('Омлет', ['Яйцо']), d('Яичница', ['Яйцо']))).toBe(false);
  });
  it('names made of products', () => {
    const pasta = ['Макароны', 'Фарш говяжий', 'Томатная паста', 'Сыр', 'Лук'];
    expect(
      sameDish(
        d('Макароны с фаршем и томатной пастой', pasta),
        d('Макароны с сыром и фаршем', pasta),
      ),
    ).toBe(true);
    expect(sameDish(d('Макароны по-флотски с фаршем', pasta), d('Макароны с фаршем', pasta))).toBe(
      true,
    );
    expect(
      sameDish(d('Курица с рисом', ['Курица', 'Рис']), d('Рис с курицей', ['Рис', 'Курица'])),
    ).toBe(true);
    expect(
      sameDish(d('Запеканка макаронная с фаршем и сыром', pasta), d('Макароны с фаршем', pasta)),
    ).toBe(false);
    expect(
      sameDish(d('Макароны с сыром', ['Макароны', 'Сыр']), d('Курица с сыром', ['Курица', 'Сыр'])),
    ).toBe(false);
    expect(
      sameDish(d('Омлет с сыром', ['Яйцо', 'Сыр']), d('Курица с сыром', ['Курица', 'Сыр'])),
    ).toBe(false);
  });
});

describe('eggs in pieces', () => {
  it('grams from the AI become pieces; other products and given pieces stay', () => {
    expect(withPieces(ing('Яйцо куриное', 110))).toMatchObject({
      pieces: 2,
      pieceGrams: 55,
      grams: 110,
    });
    expect(withPieces(ing('Яйца', 100))).toMatchObject({ pieces: 2, grams: 110 });
    expect(withPieces(ing('Яйцо', 20))).toMatchObject({ pieces: 0.5, grams: 27.5 });
    expect(withPieces(ing('Яйца перепелиные', 60))).toMatchObject({ pieces: 5, pieceGrams: 12 });
    const given = ing('Яйцо', 120, { pieces: 3, pieceGrams: 40 });
    expect(withPieces(given)).toBe(given);
    expect(withPieces(ing('Желток яичный', 30))).not.toHaveProperty('pieces');
    expect(withPieces(ing('Мука', 50))).not.toHaveProperty('pieces');
  });

  it('shows pieces with the weight, scaled by servings', () => {
    const egg = withPieces(ing('Яйцо куриное', 110));
    expect(amountText(egg).replaceAll('\u00a0', ' ')).toBe('2 шт (110 г)');
    expect(amountText(egg, 2).replaceAll('\u00a0', ' ')).toBe('4 шт (220 г)');
    expect(amountText(ing('Мука', 33.33)).replaceAll('\u00a0', ' ')).toBe('33,3 г');
  });

  it('the amount check works in pieces for eggs given only in grams', () => {
    const pantry = parsePantry('яйца 3 шт');
    const omelet = dish('Омлет', [withPieces(ing('Яйцо куриное', 110))]);
    expect(checkDish(omelet, pantry, F).short).toEqual([]);
    expect(checkDish(omelet, pantry, { ...F, servings: 2 }).short).toEqual(['Яйцо куриное']);
  });
});

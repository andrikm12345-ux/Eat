import type { OffResponse } from '../off';

/** Russian kefir with kcal and RU name. */
export const kefir: OffResponse = {
  status: 1,
  code: '4607025392408',
  product: {
    code: '4607025392408',
    product_name: 'Kefir 3.2%',
    product_name_ru: 'Кефир 3,2%',
    brands: 'Простоквашино, Danone',
    serving_size: '1 стакан (250 мл)',
    serving_quantity: '250',
    nutriments: {
      'energy-kcal_100g': 59,
      'energy-kj_100g': 247,
      proteins_100g: 3,
      fat_100g: 3.2,
      carbohydrates_100g: 4.5,
      sugars_100g: 4.5,
      salt_100g: 0.1,
      calcium_100g: 0.12,
    },
  },
};

/** Only kJ energy, comma decimals as strings, no RU name, sodium instead of salt. */
export const crackers: OffResponse = {
  status: 1,
  product: {
    product_name: '',
    generic_name: 'Crackers',
    nutriments: {
      'energy-kj_100g': '1900',
      proteins_100g: '9,5',
      fat_100g: '18',
      carbohydrates_100g: '65',
      fiber_100g: 'n/a',
      sodium_100g: 0.4,
      'vitamin-c_100g': 0.01,
      'vitamin-d_100g': 0.0000025,
    },
  },
};

/** Not found. */
export const missing: OffResponse = { status: 0, code: '0000000000000' };

/** Found but almost empty: no name, no energy, no nutriments object. */
export const bare: OffResponse = { status: 1, product: { brands: ' ' } };

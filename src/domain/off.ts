import { withKcal } from './nutrients';
import type { Nutrients, Serving } from './types';

/** Food draft produced from external sources (OFF, AI label) before user review. */
export type FoodDraft = {
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Nutrients;
  servings: Serving[];
};

type OffNutriments = Record<string, number | string | undefined>;
export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  generic_name?: string;
  generic_name_ru?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
};
export type OffResponse = { status?: number; code?: string; product?: OffProduct };

/** OFF nutriment key (per 100 g, in grams) → our key and multiplier to our unit. */
const MAP: [off: string, key: string, mul: number][] = [
  ['proteins_100g', 'protein', 1],
  ['fat_100g', 'fat', 1],
  ['carbohydrates_100g', 'carbs', 1],
  ['fiber_100g', 'fiber', 1],
  ['sugars_100g', 'sugar', 1],
  ['saturated-fat_100g', 'satFat', 1],
  ['salt_100g', 'salt', 1],
  ['sodium_100g', 'sodium', 1000],
  ['potassium_100g', 'potassium', 1000],
  ['calcium_100g', 'calcium', 1000],
  ['iron_100g', 'iron', 1000],
  ['magnesium_100g', 'magnesium', 1000],
  ['zinc_100g', 'zinc', 1000],
  ['vitamin-a_100g', 'vitA', 1e6],
  ['vitamin-c_100g', 'vitC', 1000],
  ['vitamin-d_100g', 'vitD', 1e6],
  ['vitamin-e_100g', 'vitE', 1000],
  ['vitamin-k_100g', 'vitK', 1e6],
  ['vitamin-b1_100g', 'vitB1', 1000],
  ['vitamin-b2_100g', 'vitB2', 1000],
  ['vitamin-pp_100g', 'vitB3', 1000],
  ['vitamin-b6_100g', 'vitB6', 1000],
  ['vitamin-b9_100g', 'vitB9', 1e6],
  ['vitamin-b12_100g', 'vitB12', 1e6],
  ['omega-3-fat_100g', 'omega3', 1],
];

const KJ_PER_KCAL = 4.184;

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Maps OFF nutriments to per-100 g nutrients; kcal from kJ or Atwater when absent. */
export function mapOffNutriments(n: OffNutriments): Nutrients {
  const out: Partial<Nutrients> = {};
  for (const [off, key, mul] of MAP) {
    const v = num(n[off]);
    if (v !== null) out[key] = round(v * mul);
  }
  if (out.salt === undefined && out.sodium !== undefined)
    out.salt = round((out.sodium * 2.5) / 1000);
  if (out.sodium === undefined && out.salt !== undefined)
    out.sodium = round((out.salt / 2.5) * 1000);
  const kcal = num(n['energy-kcal_100g']);
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const energy = kcal ?? (kj !== null ? round(kj / KJ_PER_KCAL) : null);
  return withKcal({
    ...out,
    protein: out.protein ?? 0,
    fat: out.fat ?? 0,
    carbs: out.carbs ?? 0,
    ...(energy !== null ? { kcal: energy } : {}),
  });
}

/** Maps an OFF v2 response to a draft; `null` when the product is unknown. */
export function mapOffProduct(res: OffResponse, barcode: string): FoodDraft | null {
  const p = res.product;
  if (res.status !== 1 || !p) return null;
  const name =
    [p.product_name_ru, p.product_name, p.generic_name_ru, p.generic_name]
      .map((s) => s?.trim())
      .find((s) => !!s) ?? `Продукт ${barcode}`;
  const brand = p.brands?.split(',')[0]?.trim();
  const sq = num(p.serving_quantity);
  const servings: Serving[] =
    sq && sq > 0 ? [{ label: p.serving_size?.trim() || 'порция', grams: sq }] : [];
  return {
    name,
    ...(brand ? { brand } : {}),
    barcode: p.code || res.code || barcode,
    per100g: mapOffNutriments(p.nutriments ?? {}),
    servings,
  };
}

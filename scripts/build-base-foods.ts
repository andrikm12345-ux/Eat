// Builds src/data/baseFoods.json from the USDA FoodData Central SR Legacy JSON
// (public domain). Food ids (base-<fdcId>) must stay stable: entries reference them.
// Run once locally:
//   curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip
//   unzip FoodData_Central_sr_legacy_food_json_2018-04.zip
//   node scripts/build-base-foods.ts path/to/FoodData_Central_sr_legacy_food_json_2018-04.json
import { readFileSync, writeFileSync } from 'node:fs';
import { BASE_FOODS_MAP } from './base-foods-map.ts';

type SrNutrient = { nutrient: { number: string; unitName: string }; amount?: number };
type SrFood = { fdcId: number; description: string; foodNutrients: SrNutrient[] };

/** SR nutrient number → our key. Units follow NUTRIENT_DEFS (g, mg, µg). */
const NUTRIENTS: Record<string, string> = {
  '208': 'kcal',
  '203': 'protein',
  '204': 'fat',
  '205': 'carbs',
  '291': 'fiber',
  '269': 'sugar',
  '606': 'satFat',
  '307': 'sodium',
  '306': 'potassium',
  '301': 'calcium',
  '303': 'iron',
  '304': 'magnesium',
  '309': 'zinc',
  '320': 'vitA',
  '401': 'vitC',
  '328': 'vitD',
  '323': 'vitE',
  '430': 'vitK',
  '404': 'vitB1',
  '405': 'vitB2',
  '406': 'vitB3',
  '415': 'vitB6',
  '435': 'vitB9',
  '418': 'vitB12',
};
/** Omega-3 parts: ALA, EPA, DPA, DHA (g). */
const OMEGA3 = ['851', '629', '631', '621'];

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/build-base-foods.ts <sr_legacy.json>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(path, 'utf8')) as { SRLegacyFoods: SrFood[] };
const byDesc = new Map(data.SRLegacyFoods.map((f) => [f.description.toLowerCase(), f]));

const round = (v: number) => Math.round(v * 1000) / 1000;
const out: unknown[] = [];
const missing: string[] = [];
const seen = new Set<string>();

for (const [ru, sr, servings] of BASE_FOODS_MAP) {
  const f = byDesc.get(sr.toLowerCase());
  if (!f) {
    missing.push(`${ru} ← ${sr}`);
    continue;
  }
  if (seen.has(ru)) throw new Error(`Duplicate name: ${ru}`);
  seen.add(ru);
  const per100g: Record<string, number> = {};
  let omega3: number | null = null;
  for (const n of f.foodNutrients) {
    const num = n.nutrient.number;
    if (typeof n.amount !== 'number') continue;
    const key = NUTRIENTS[num];
    if (key) per100g[key] = round(n.amount);
    if (OMEGA3.includes(num)) omega3 = (omega3 ?? 0) + n.amount;
  }
  if (omega3 !== null) per100g.omega3 = round(omega3);
  if (per100g.sodium !== undefined) per100g.salt = round((per100g.sodium * 2.5) / 1000);
  for (const k of ['kcal', 'protein', 'fat', 'carbs']) per100g[k] ??= 0;
  out.push({
    id: `base-${f.fdcId}${ru.includes('черри') ? '-c' : ''}${out.some((o) => (o as { fdcId: number }).fdcId === f.fdcId) ? `-${out.length}` : ''}`,
    fdcId: f.fdcId,
    name: ru,
    per100g,
    servings: (servings ?? []).map(([label, grams]) => ({ label, grams })),
  });
}

if (missing.length) {
  console.error(`Not found (${missing.length}):\n  ${missing.join('\n  ')}`);
  process.exit(2);
}
const file = new URL('../src/data/baseFoods.json', import.meta.url);
writeFileSync(
  file,
  JSON.stringify({
    version: 1,
    source: 'USDA FoodData Central SR Legacy (2018-04), public domain',
    foods: out,
  }),
);
console.log(`Wrote ${out.length} foods`);

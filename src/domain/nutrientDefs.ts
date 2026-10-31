import type { Sex } from './types';

/**
 * Reference intakes for adults (US DRIs: RDA/AI; WHO for limits). `target` nutrients are
 * "at least" goals; `limit` nutrients are "at most" (no deficit concept).
 */
export type NutrientDef = {
  key: string;
  name: string;
  unit: 'г' | 'мг' | 'мкг';
  kind: 'target' | 'limit';
  /** Daily reference by sex and age. */
  rda: (sex: Sex, age: number) => number;
  /** Tolerable upper intake level, if defined. */
  ul?: number;
};

const bySex = (m: number, f: number) => (sex: Sex) => (sex === 'male' ? m : f);

export const NUTRIENT_DEFS: NutrientDef[] = [
  {
    key: 'fiber',
    name: 'Клетчатка',
    unit: 'г',
    kind: 'target',
    rda: (s, a) => (s === 'male' ? (a > 50 ? 30 : 38) : a > 50 ? 21 : 25),
  },
  { key: 'sugar', name: 'Сахар', unit: 'г', kind: 'limit', rda: bySex(50, 50) },
  { key: 'satFat', name: 'Насыщенные жиры', unit: 'г', kind: 'limit', rda: bySex(22, 20) },
  { key: 'sodium', name: 'Натрий', unit: 'мг', kind: 'limit', rda: () => 2300 },
  { key: 'salt', name: 'Соль', unit: 'г', kind: 'limit', rda: () => 5 },
  { key: 'potassium', name: 'Калий', unit: 'мг', kind: 'target', rda: bySex(3400, 2600) },
  {
    key: 'calcium',
    name: 'Кальций',
    unit: 'мг',
    kind: 'target',
    rda: (s, a) => (a > 70 || (s === 'female' && a > 50) ? 1200 : 1000),
    ul: 2500,
  },
  {
    key: 'iron',
    name: 'Железо',
    unit: 'мг',
    kind: 'target',
    rda: (s, a) => (s === 'male' || a > 50 ? 8 : 18),
    ul: 45,
  },
  {
    key: 'magnesium',
    name: 'Магний',
    unit: 'мг',
    kind: 'target',
    rda: (s, a) => (s === 'male' ? (a > 30 ? 420 : 400) : a > 30 ? 320 : 310),
  },
  { key: 'zinc', name: 'Цинк', unit: 'мг', kind: 'target', rda: bySex(11, 8), ul: 40 },
  { key: 'vitA', name: 'Витамин A', unit: 'мкг', kind: 'target', rda: bySex(900, 700), ul: 3000 },
  { key: 'vitC', name: 'Витамин C', unit: 'мг', kind: 'target', rda: bySex(90, 75), ul: 2000 },
  {
    key: 'vitD',
    name: 'Витамин D',
    unit: 'мкг',
    kind: 'target',
    rda: (_s, a) => (a > 70 ? 20 : 15),
    ul: 100,
  },
  { key: 'vitE', name: 'Витамин E', unit: 'мг', kind: 'target', rda: () => 15, ul: 1000 },
  { key: 'vitK', name: 'Витамин K', unit: 'мкг', kind: 'target', rda: bySex(120, 90) },
  { key: 'vitB1', name: 'Витамин B1', unit: 'мг', kind: 'target', rda: bySex(1.2, 1.1) },
  { key: 'vitB2', name: 'Витамин B2', unit: 'мг', kind: 'target', rda: bySex(1.3, 1.1) },
  { key: 'vitB3', name: 'Витамин B3 (PP)', unit: 'мг', kind: 'target', rda: bySex(16, 14), ul: 35 },
  {
    key: 'vitB6',
    name: 'Витамин B6',
    unit: 'мг',
    kind: 'target',
    rda: (s, a) => (a > 50 ? (s === 'male' ? 1.7 : 1.5) : 1.3),
    ul: 100,
  },
  { key: 'vitB9', name: 'Фолат (B9)', unit: 'мкг', kind: 'target', rda: () => 400 },
  { key: 'vitB12', name: 'Витамин B12', unit: 'мкг', kind: 'target', rda: () => 2.4 },
  { key: 'omega3', name: 'Омега-3', unit: 'г', kind: 'target', rda: bySex(1.6, 1.1) },
];

export const MIN_COVERAGE = 0.6;

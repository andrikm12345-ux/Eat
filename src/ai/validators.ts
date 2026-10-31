// Hand-written validators for the strict JSON schemas of prompts A, B and C.

import type { Confidence } from '../domain/types';

export type Valid<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const CONF: Confidence[] = ['high', 'medium', 'low'];

export type MealItem = {
  name: string;
  grams: number;
  per100g: { kcal: number; protein: number; fat: number; carbs: number; fiber?: number };
  confidence: Confidence;
  assumed: boolean;
  searchHint: string;
};
export type MealResult = { items: MealItem[]; mealGuess: string | null; notes: string };

function per100(
  v: unknown,
  path: string,
  errors: string[],
  required: string[],
  optional: string[],
) {
  if (!isObj(v)) {
    errors.push(`${path}: нужен объект`);
    return null;
  }
  const out: Record<string, number> = {};
  for (const k of required) {
    if (!num(v[k])) errors.push(`${path}.${k}: нужно число ≥ 0`);
    else out[k] = v[k] as number;
  }
  for (const k of optional) {
    if (v[k] === undefined || v[k] === null) continue;
    if (!num(v[k])) errors.push(`${path}.${k}: нужно число ≥ 0 или null`);
    else out[k] = v[k] as number;
  }
  return out;
}

export function validateMeal(data: unknown): Valid<MealResult> {
  const errors: string[] = [];
  if (!isObj(data)) return { ok: false, errors: ['корень: нужен объект'] };
  if (!Array.isArray(data.items) || data.items.length === 0)
    errors.push('items: нужен непустой массив');
  const items: MealItem[] = [];
  (Array.isArray(data.items) ? data.items : []).forEach((it: unknown, i: number) => {
    const p = `items[${i}]`;
    if (!isObj(it)) {
      errors.push(`${p}: нужен объект`);
      return;
    }
    if (typeof it.name !== 'string' || !it.name.trim()) errors.push(`${p}.name: нужна строка`);
    if (!num(it.grams) || (it.grams as number) > 5000) errors.push(`${p}.grams: число 0–5000`);
    const n = per100(
      it.per100g,
      `${p}.per100g`,
      errors,
      ['kcal', 'protein', 'fat', 'carbs'],
      ['fiber'],
    );
    if (!CONF.includes(it.confidence as Confidence))
      errors.push(`${p}.confidence: high|medium|low`);
    if (it.assumed !== undefined && typeof it.assumed !== 'boolean')
      errors.push(`${p}.assumed: boolean`);
    if (n && typeof it.name === 'string' && num(it.grams)) {
      items.push({
        name: it.name.trim(),
        grams: it.grams as number,
        per100g: n as MealItem['per100g'],
        confidence: (CONF.includes(it.confidence as Confidence)
          ? it.confidence
          : 'low') as Confidence,
        assumed: it.assumed === true,
        searchHint:
          typeof it.searchHint === 'string' && it.searchHint.trim()
            ? it.searchHint.trim()
            : (it.name as string),
      });
    }
  });
  if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string')
    errors.push('notes: строка');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      items,
      mealGuess:
        typeof data.mealGuess === 'string' && data.mealGuess !== 'null' ? data.mealGuess : null,
      notes: typeof data.notes === 'string' ? data.notes.slice(0, 300) : '',
    },
  };
}

export type LabelResult = {
  name: string | null;
  brand: string | null;
  barcode: string | null;
  per100g: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber?: number;
    sugar?: number;
    satFat?: number;
    salt?: number;
  };
  serving: { label: string; grams: number } | null;
  confidence: Confidence;
  warnings: string[];
};

const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function validateLabel(data: unknown): Valid<LabelResult> {
  const errors: string[] = [];
  if (!isObj(data)) return { ok: false, errors: ['корень: нужен объект'] };
  const n = per100(
    data.per100g,
    'per100g',
    errors,
    ['kcal', 'protein', 'fat', 'carbs'],
    ['fiber', 'sugar', 'satFat', 'salt'],
  );
  if (n && (n.protein as number) + (n.fat as number) + (n.carbs as number) > 101)
    errors.push('per100g: сумма БЖУ больше 100 г');
  if (!CONF.includes(data.confidence as Confidence)) errors.push('confidence: high|medium|low');
  let serving: LabelResult['serving'] = null;
  if (isObj(data.serving) && num(data.serving.grams) && (data.serving.grams as number) > 0) {
    serving = {
      label: strOrNull(data.serving.label) ?? 'порция',
      grams: data.serving.grams as number,
    };
  }
  if (data.warnings !== undefined && !Array.isArray(data.warnings))
    errors.push('warnings: массив строк');
  if (errors.length || !n) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: strOrNull(data.name),
      brand: strOrNull(data.brand),
      barcode: strOrNull(data.barcode),
      per100g: n as LabelResult['per100g'],
      serving,
      confidence: data.confidence as Confidence,
      warnings: Array.isArray(data.warnings)
        ? data.warnings.filter((w): w is string => typeof w === 'string')
        : [],
    },
  };
}

export type PhotoResult =
  { kind: 'meal'; meal: MealResult } | { kind: 'label'; label: LabelResult };

/** Answer to the combined photo prompt: {kind:"meal",meal} or {kind:"label",label}. */
export function validatePhoto(data: unknown): Valid<PhotoResult> {
  if (!isObj(data)) return { ok: false, errors: ['корень: нужен объект'] };
  if (data.kind === 'label') {
    const v = validateLabel(data.label);
    return v.ok
      ? { ok: true, value: { kind: 'label', label: v.value } }
      : { ok: false, errors: v.errors.map((e) => `label.${e}`) };
  }
  if (data.kind === 'meal') {
    const v = validateMeal(data.meal);
    return v.ok
      ? { ok: true, value: { kind: 'meal', meal: v.value } }
      : { ok: false, errors: v.errors.map((e) => `meal.${e}`) };
  }
  return { ok: false, errors: ['kind: нужно "meal" или "label"'] };
}

export type WeeklyResult = {
  observations: { title: string; text: string; evidence: string }[];
  suggestions: { text: string; type: string }[];
  dataQuality: 'good' | 'limited' | 'poor';
};

export function validateWeekly(data: unknown): Valid<WeeklyResult> {
  const errors: string[] = [];
  if (!isObj(data)) return { ok: false, errors: ['корень: нужен объект'] };
  const obs = Array.isArray(data.observations) ? data.observations : null;
  if (!obs || obs.length === 0) errors.push('observations: нужен непустой массив');
  const sug = Array.isArray(data.suggestions) ? data.suggestions : null;
  if (!sug) errors.push('suggestions: нужен массив');
  if (!['good', 'limited', 'poor'].includes(data.dataQuality as string))
    errors.push('dataQuality: good|limited|poor');
  const observations = (obs ?? []).filter(isObj).map((o) => ({
    title: String(o.title ?? ''),
    text: String(o.text ?? '').slice(0, 300),
    evidence: String(o.evidence ?? ''),
  }));
  if (observations.some((o) => !o.title || !o.text))
    errors.push('observations[]: нужны title и text');
  const suggestions = (sug ?? [])
    .filter(isObj)
    .map((s) => ({ text: String(s.text ?? '').slice(0, 240), type: String(s.type ?? 'other') }));
  if (suggestions.some((s) => !s.text)) errors.push('suggestions[]: нужен text');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      observations,
      suggestions,
      dataQuality: data.dataQuality as WeeklyResult['dataQuality'],
    },
  };
}

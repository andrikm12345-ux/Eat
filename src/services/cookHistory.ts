import type { CookSteps } from '../ai/cookValidators';
import type { Repos } from '../db/repos';
import { amountText } from '../domain/cook';
import type { CookDish, CookResult } from './cook';
import type { CookForm } from '../state/cook';

/**
 * «Что приготовить» history: what was written in, under which conditions, which dishes the AI
 * offered and the recipes that were opened. Kept in settings, so it goes to the cloud with the
 * diary and the administrator sees it next to the diary. Short: names and numbers, not the
 * whole AI answer.
 */
export const COOK_HISTORY_SETTING = 'cookHistory';
export const COOK_HISTORY_LIMIT = 30;

export type CookHistoryDish = {
  name: string;
  minutes: number;
  kcal: number;
  protein: number;
  missing: string[];
  short: string[];
};

export type CookHistoryRecipe = {
  name: string;
  servings: number;
  /** "Рис круглозёрный 70 г". */
  ingredients: string[];
  steps: string[];
  tip: string;
};

export type CookHistoryEntry = {
  id: string;
  at: string;
  pantry: string;
  conditions: Pick<CookForm, 'basics' | 'noBuy' | 'maxMinutes' | 'meal' | 'servings' | 'wishes'>;
  dishes: CookHistoryDish[];
  /** How many proposals did not pass the check. */
  rejected: number;
  recipes: CookHistoryRecipe[];
};

export async function loadCookHistory(r: Repos): Promise<CookHistoryEntry[]> {
  const v = await r.settings.get<CookHistoryEntry[]>(COOK_HISTORY_SETTING, []);
  return Array.isArray(v) ? v : [];
}

const save = (r: Repos, list: CookHistoryEntry[]) =>
  r.settings.set(COOK_HISTORY_SETTING, list.slice(0, COOK_HISTORY_LIMIT));

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Records one search; returns its id (to attach the recipes opened from it). */
export async function recordCookSearch(
  r: Repos,
  form: CookForm,
  result: CookResult,
  now: Date = new Date(),
): Promise<string> {
  const id = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: CookHistoryEntry = {
    id,
    at: now.toISOString(),
    pantry: form.text.trim().slice(0, 500),
    conditions: {
      basics: form.basics,
      noBuy: form.noBuy,
      maxMinutes: form.maxMinutes,
      meal: form.meal,
      servings: form.servings,
      wishes: form.wishes.trim().slice(0, 200),
    },
    dishes: result.dishes.map((d) => ({
      name: d.idea.name,
      minutes: d.idea.minutes,
      kcal: Math.round(d.perServing.kcal),
      protein: round1(d.perServing.protein),
      missing: d.missing,
      short: d.short,
    })),
    rejected: result.rejected.length,
    recipes: [],
  };
  await save(r, [entry, ...(await loadCookHistory(r))]);
  return id;
}

/** Adds the recipe the AI wrote for a dish of that search (once per dish). */
export async function recordCookRecipe(
  r: Repos,
  searchId: string,
  dish: CookDish,
  servings: number,
  steps: CookSteps,
): Promise<void> {
  const list = await loadCookHistory(r);
  const entry = list.find((e) => e.id === searchId);
  if (!entry || entry.recipes.some((x) => x.name === dish.idea.name)) return;
  entry.recipes.push({
    name: dish.idea.name,
    servings,
    ingredients: dish.resolved.map((i) => `${i.name} ${amountText(i, servings)}`),
    steps: steps.steps.map((s) => (s.minutes ? `${s.text} (${s.minutes} мин)` : s.text)),
    tip: steps.tip,
  });
  await save(r, list);
}

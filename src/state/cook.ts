import { create } from 'zustand';
import type { CookSteps } from '../ai/cookValidators';
import type { Equipment, PantryItem } from '../domain/cook';
import type { CookDish, CookResult, MealKind } from '../services/cook';

/** What the person set on the «Что приготовить» screen (kept between visits). */
export type CookForm = {
  text: string;
  basics: boolean;
  noBuy: boolean;
  maxMinutes: number | null;
  meal: MealKind;
  servings: number;
  wishes: string;
  /** What there is in the kitchen. */
  equipment: Equipment[];
};

export const COOK_FORM_SETTING = 'cookForm';

export const DEFAULT_COOK_FORM: CookForm = {
  text: '',
  basics: true,
  noBuy: false,
  maxMinutes: null,
  meal: 'any',
  servings: 1,
  wishes: '',
  equipment: ['stove', 'oven', 'microwave'],
};

type CookState = {
  /** The last search: its pantry and servings go with the result. */
  result:
    | (CookResult & {
        pantry: PantryItem[];
        servings: number;
        basics: boolean;
        /** The history record of this search (the opened recipes are added to it). */
        searchId?: string;
      })
    | null;
  /** The dish opened on the recipe screen. */
  dish: CookDish | null;
  /** Steps already written, by dish name and servings. */
  steps: Record<string, CookSteps>;
  setResult: (r: CookState['result']) => void;
  openDish: (d: CookDish | null) => void;
  putSteps: (key: string, s: CookSteps) => void;
};

export const stepsKey = (name: string, servings: number) => `${name}|${servings}`;

export const useCook = create<CookState>((set, get) => ({
  result: null,
  dish: null,
  steps: {},
  setResult: (result) => set({ result }),
  openDish: (dish) => set({ dish }),
  putSteps: (key, s) => set({ steps: { ...get().steps, [key]: s } }),
}));

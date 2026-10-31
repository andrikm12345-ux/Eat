import { create } from 'zustand';
import type { Confidence, EntrySource, LocalDate, LocalTime, Nutrients } from '../domain/types';

export type ReviewSource = 'ai' | 'off' | 'catalog' | 'manual';

export type ReviewItem = {
  key: string;
  name: string;
  grams: number;
  per100g: Nutrients;
  source: ReviewSource;
  confidence?: Confidence;
  /** AI assumed a hidden component (oil, sauce…). */
  assumed?: boolean;
  foodId?: string;
  recipeId?: string;
  /** Alternative data source for this item (AI estimate ↔ catalog food). */
  alt?: {
    name: string;
    per100g: Nutrients;
    source: ReviewSource;
    foodId?: string;
    confidence?: Confidence;
    assumed?: boolean;
  };
};

/** Swaps an item with its alternative, keeping grams. */
export function swapAlt(i: ReviewItem): ReviewItem {
  if (!i.alt) return i;
  const { alt, key, grams } = i;
  return {
    key,
    grams,
    name: alt.name,
    per100g: alt.per100g,
    source: alt.source,
    ...(alt.foodId ? { foodId: alt.foodId } : {}),
    ...((alt.confidence ?? i.confidence) ? { confidence: alt.confidence ?? i.confidence } : {}),
    ...((alt.assumed ?? i.assumed) ? { assumed: true } : {}),
    alt: {
      name: i.name,
      per100g: i.per100g,
      source: i.source,
      ...(i.foodId ? { foodId: i.foodId } : {}),
      ...(i.confidence ? { confidence: i.confidence } : {}),
      ...(i.assumed ? { assumed: i.assumed } : {}),
    },
  };
}

export type ReviewDraft = {
  items: ReviewItem[];
  entrySource: EntrySource;
  date: LocalDate;
  time: LocalTime;
  mealLabel?: string;
  /** Small-print comment, e.g. AI assumptions. */
  notes?: string;
  aiRunId?: string;
};

type ReviewState = {
  draft: ReviewDraft | null;
  setDraft: (d: ReviewDraft | null) => void;
};

/** Pending data for the review screen (nothing is saved until "Сохранить"). */
export const useReview = create<ReviewState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));

let k = 0;
export const reviewKey = () => `r${++k}`;

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
  /** Weight of one piece, for countable products (the count is grams / piece.grams). */
  piece?: { grams: number };
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

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A hand-edited item is the user's own data: manual source, no link to a catalog food. */
function asManual(i: ReviewItem, per100g: Nutrients): ReviewItem {
  const { foodId: _dropped, ...rest } = i;
  return { ...rest, per100g, source: 'manual' };
}

/** Sets the calories of the portion eaten (per-100 g calories follow; macros stay as they are). */
export function withPortionKcal(i: ReviewItem, kcal: number): ReviewItem {
  if (i.grams <= 0) return i;
  return asManual(i, { ...i.per100g, kcal: round2((kcal * 100) / i.grams) });
}

/** Edits the per-100 g values of an item by hand. */
export function withPer100(
  i: ReviewItem,
  patch: Partial<Pick<Nutrients, 'kcal' | 'protein' | 'fat' | 'carbs'>>,
): ReviewItem {
  return asManual(i, { ...i.per100g, ...patch });
}

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
    ...(i.piece ? { piece: i.piece } : {}),
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
  /** How the items were produced: by AI or locally from the catalog (shown on the review screen). */
  analysis?: 'ai' | 'local';
  /** Web pages the AI was given as a reference (shown so the user can check them). */
  sources?: { title: string; url: string }[];
  /** A scanned barcode the product was identified for: it is bound to the saved product. */
  barcode?: string;
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

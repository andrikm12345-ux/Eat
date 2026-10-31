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
};

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

import { create } from 'zustand';
import { toLocalDate } from '../domain/dates';
import type { LocalDate } from '../domain/types';

type UiState = {
  /** Day shown on "Сегодня" (and used as default for adding). */
  date: LocalDate;
  setDate: (d: LocalDate) => void;
  /** "Добавить" sheet; `time` is set when opened from a tap on the day line. */
  addSheet: { open: boolean; time?: string };
  openAdd: (time?: string) => void;
  closeAdd: () => void;
  weighOpen: boolean;
  setWeighOpen: (v: boolean) => void;
};

export const useUi = create<UiState>((set) => ({
  date: toLocalDate(new Date()),
  setDate: (date) => set({ date }),
  addSheet: { open: false },
  openAdd: (time) => set({ addSheet: time ? { open: true, time } : { open: true } }),
  closeAdd: () => set({ addSheet: { open: false } }),
  weighOpen: false,
  setWeighOpen: (weighOpen) => set({ weighOpen }),
}));

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void | Promise<void> };
  durationMs: number;
};

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { durationMs: 5000, ...t, id };
    set({ toasts: [...get().toasts.slice(-2), toast] });
    setTimeout(() => get().dismiss(id), toast.durationMs);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Shorthand outside React. */
export const toast = (t: Parameters<ToastState['push']>[0]) => useToasts.getState().push(t);

import { buzz } from '../ui/haptics';
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

let knownToday = toLocalDate(new Date());

/**
 * The day changed while the app stayed open (a phone resumes the app the next morning):
 * if the screen was showing the old "today", move it to the new one. A day the user picked
 * on purpose stays. Returns true when it moved.
 */
export function rollOverToday(now: Date = new Date()): boolean {
  const today = toLocalDate(now);
  if (today === knownToday) return false;
  const wasToday = useUi.getState().date === knownToday;
  knownToday = today;
  if (wasToday) useUi.getState().setDate(today);
  return wasToday;
}

/** Checks for a new day on resume, focus and once a minute. Returns a stop function. */
export function startTodayWatcher(): () => void {
  const check = () => void rollOverToday();
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', check);
  const timer = window.setInterval(check, 60_000);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', check);
    window.clearInterval(timer);
  };
}

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void | Promise<void> };
  durationMs: number;
  /** Playing the exit animation; removed right after. */
  leaving?: boolean;
};

const TOAST_EXIT_MS = 220;

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
    if (t.action) buzz(12);
    // At most two at a time: a pile of messages hides the screen.
    set({ toasts: [...get().toasts.slice(-1), toast] });
    setTimeout(() => get().dismiss(id), toast.durationMs);
    return id;
  },
  dismiss: (id) => {
    if (!get().toasts.some((x) => x.id === id && !x.leaving)) return;
    set({ toasts: get().toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x)) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), TOAST_EXIT_MS);
  },
}));

/** Shorthand outside React. */
export const toast = (t: Parameters<ToastState['push']>[0]) => useToasts.getState().push(t);

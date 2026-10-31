import { create } from 'zustand';

type CelebrateState = {
  /** Increments to trigger a confetti burst. */
  burst: number;
  fire: () => void;
};

export const useCelebrate = create<CelebrateState>((set, get) => ({
  burst: 0,
  fire: () => set({ burst: get().burst + 1 }),
}));

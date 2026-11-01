import { create } from 'zustand';

type CelebrateState = {
  /** Increments to trigger a confetti burst. */
  burst: number;
  fire: () => void;
  /** Text of the achievement card that is on screen right now. */
  card: { id: number; text: string } | null;
  showCard: (text: string) => void;
  hideCard: (id: number) => void;
};

let cardId = 1;

export const useCelebrate = create<CelebrateState>((set, get) => ({
  burst: 0,
  fire: () => set({ burst: get().burst + 1 }),
  card: null,
  showCard: (text) => {
    const id = cardId++;
    set({ card: { id, text } });
    setTimeout(() => get().hideCard(id), 4200);
  },
  hideCard: (id) => {
    if (get().card?.id === id) set({ card: null });
  },
}));

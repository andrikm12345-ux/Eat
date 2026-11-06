import { useLayoutEffect } from 'react';
import { create } from 'zustand';

/** The title of the inner screen on screen now: shown on the sky strip at the top. */
export const usePageTitleStore = create<{ title: string; set: (t: string) => void }>((set) => ({
  title: '',
  set: (title) => set({ title }),
}));

/** Puts this screen's title on the sky strip while the screen is open. */
export function usePageTitle(title: string) {
  const set = usePageTitleStore((s) => s.set);
  useLayoutEffect(() => {
    set(title);
    return () => set('');
  }, [title, set]);
}

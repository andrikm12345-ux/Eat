import { useEffect, useRef, useState } from 'react';

export const LEAVE_MS = 280;

type Item = { id: string; time: string };

/**
 * Keeps removed items on screen for a moment so they can collapse instead of vanishing,
 * and tells which items are new (everything present on the first render is not).
 */
export function useLeaving<T extends Item>(items: T[]) {
  const prev = useRef<Map<string, T> | null>(null);
  const [ghosts, setGhosts] = useState<T[]>([]);
  const fresh = useRef(new Set<string>());
  // Each removal has its own timer. It must outlive the next update of the list: when entries
  // change one after another (a sync does that) a timer cancelled by the next update would leave
  // its ghost on screen for good: an invisible row with a time that still counts in "×N".
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const now = new Map(items.map((i) => [i.id, i]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    for (const id of now.keys()) if (!before.has(id)) fresh.current.add(id);
    const gone = [...before.values()].filter((i) => !now.has(i.id));
    if (gone.length === 0) return;
    setGhosts((g) => [...g, ...gone]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setGhosts((g) => g.filter((x) => !gone.some((y) => y.id === x.id)));
    }, LEAVE_MS);
    timers.current.add(t);
  }, [items]);

  const ids = new Set(items.map((i) => i.id));
  const visibleGhosts = ghosts.filter((g) => !ids.has(g.id));
  const list = visibleGhosts.length
    ? [...items, ...visibleGhosts].sort((a, b) => a.time.localeCompare(b.time))
    : items;
  return {
    list,
    leaving: new Set(visibleGhosts.map((g) => g.id)),
    isFresh: (id: string) => fresh.current.has(id),
  };
}

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

  useEffect(() => {
    const now = new Map(items.map((i) => [i.id, i]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    for (const id of now.keys()) if (!before.has(id)) fresh.current.add(id);
    const gone = [...before.values()].filter((i) => !now.has(i.id));
    if (gone.length === 0) return;
    setGhosts((g) => [...g, ...gone]);
    const t = setTimeout(
      () => setGhosts((g) => g.filter((x) => !gone.some((y) => y.id === x.id))),
      LEAVE_MS,
    );
    return () => clearTimeout(t);
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

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { buildIndex, search } from '../../domain/search';
import type { Food } from '../../domain/types';
import { repos } from '../../db/repos';

/** Live list of all non-deleted foods with a memoized search index. */
export function useCatalog() {
  const foods = useLiveQuery(() => repos.foods.list(), []);
  const index = useMemo(() => (foods ? buildIndex(foods) : null), [foods]);
  return {
    foods,
    search: (q: string, limit = 50): Food[] => (index ? search(index, q, { limit }) : []),
  };
}

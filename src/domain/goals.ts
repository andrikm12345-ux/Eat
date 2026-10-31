import type { Goal, LocalDate } from './types';

/**
 * Goal in force on `date`: the non-deleted goal with the greatest `validFrom ≤ date`.
 * Ties on `validFrom` are resolved by the latest `createdAt`.
 */
export function goalFor<G extends Pick<Goal, 'validFrom' | 'createdAt' | 'deletedAt'>>(
  goals: readonly G[],
  date: LocalDate,
): G | undefined {
  let best: G | undefined;
  for (const g of goals) {
    if (g.deletedAt || g.validFrom > date) continue;
    if (
      !best ||
      g.validFrom > best.validFrom ||
      (g.validFrom === best.validFrom && g.createdAt > best.createdAt)
    ) {
      best = g;
    }
  }
  return best;
}

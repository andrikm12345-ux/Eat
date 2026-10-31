import { useLiveQuery } from 'dexie-react-hooks';
import { computeTrend, pickDailyWeights } from '../../domain/weightTrend';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';

/** All weigh-ins and the EMA trend with the user's settings. */
export function useTrend() {
  return useLiveQuery(async () => {
    const [weights, alpha, pick] = await Promise.all([
      repos.weights.list(),
      repos.settings.get(SETTINGS.trendAlpha.key, SETTINGS.trendAlpha.def),
      repos.settings.get(SETTINGS.weightDailyPick.key, SETTINGS.weightDailyPick.def),
    ]);
    const sorted = weights.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const points = computeTrend(pickDailyWeights(sorted, pick), alpha);
    return { weights: sorted, points, alpha, pick };
  }, []);
}

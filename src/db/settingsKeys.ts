/** Keys of the `settings` table with their defaults. */
export const SETTINGS = {
  trendAlpha: { key: 'trendAlpha', def: 0.1 },
  weightDailyPick: { key: 'weightDailyPick', def: 'first' as 'first' | 'min' },
  /** Day of week for the measurement reminder (0 = Sunday … 6 = Saturday). */
  measureWeekday: { key: 'measureWeekday', def: 0 },
  tdeeWindowDays: { key: 'tdeeWindowDays', def: 21 },
  tdeeRho: { key: 'tdeeRho', def: 7700 },
  /** Day of week for the weekly check-in (1 = Monday). */
  checkinWeekday: { key: 'checkinWeekday', def: 1 },
} as const;

/** Key for a banner dismissed on a specific day. */
export const bannerDismissKey = (id: string, date: string) => `banner:${id}:${date}`;

/** Keys of the `settings` table with their defaults. */
export const SETTINGS = {
  trendAlpha: { key: 'trendAlpha', def: 0.1 },
  weightDailyPick: { key: 'weightDailyPick', def: 'first' as 'first' | 'min' },
  /** Day of week for the measurement reminder (0 = Sunday … 6 = Saturday). */
  measureWeekday: { key: 'measureWeekday', def: 0 },
} as const;

/** Key for a banner dismissed on a specific day. */
export const bannerDismissKey = (id: string, date: string) => `banner:${id}:${date}`;

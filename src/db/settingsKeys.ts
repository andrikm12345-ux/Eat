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
  confetti: { key: 'celebrateConfetti', def: true },
  vibrate: { key: 'celebrateVibrate', def: true },
  /** App icon badge: none | protein (g left today) | weigh (days since last weigh-in). */
  badgeMode: { key: 'badgeMode', def: 'none' as 'none' | 'protein' | 'weigh' },
  notifyWhileOpen: { key: 'notifyWhileOpen', def: false },
  weighTime: { key: 'weighTime', def: '07:30' as string },
  /** Weekly review reminder day (0 = Sunday) and time. */
  reviewWeekday: { key: 'reviewWeekday', def: 0 },
  reviewTime: { key: 'reviewTime', def: '19:00' as string },
  tdeeExplained: { key: 'tdeeExplained', def: false },
  lastBackupAt: { key: 'lastBackupAt', def: '' as string },
  backupCount: { key: 'backupCount', def: 0 },
} as const;

/** Key for a banner dismissed on a specific day. */
export const bannerDismissKey = (id: string, date: string) => `banner:${id}:${date}`;

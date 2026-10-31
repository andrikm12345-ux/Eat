import type { ru } from '../../i18n/ru';

type Key = keyof typeof ru.more.items;

/** "Ещё" menu. `to: null` marks sections that are not available yet. */
export const MORE_MENU: { key: Key; to: string | null }[] = [
  { key: 'profile', to: '/more/profile' },
  { key: 'wizard', to: '/wizard' },
  { key: 'foods', to: '/foods' },
  { key: 'recipes', to: '/recipes' },
  { key: 'templates', to: '/templates' },
  { key: 'workouts', to: '/workouts' },
  { key: 'achievements', to: null },
  { key: 'reminders', to: null },
  { key: 'ai', to: null },
  { key: 'data', to: '/data/csv' },
  { key: 'storage', to: null },
  { key: 'about', to: null },
];

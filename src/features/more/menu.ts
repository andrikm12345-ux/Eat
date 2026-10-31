import type { ComponentType, SVGProps } from 'react';
import { ru } from '../../i18n/ru';
import {
  IconBell,
  IconBook,
  IconCopy,
  IconDatabase,
  IconDownload,
  IconInfo,
  IconPulse,
  IconSpark,
  IconTag,
  IconTrophy,
  IconUser,
} from '../../ui/icons';

type Key = keyof typeof ru.more.items;
export type MenuItem = { key: Key; to: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

/** "Ещё": grouped by what you do, most used first. */
export const MORE_GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: ru.more.groups.food,
    items: [
      { key: 'foods', to: '/foods', Icon: IconTag },
      { key: 'recipes', to: '/recipes', Icon: IconBook },
      { key: 'templates', to: '/templates', Icon: IconCopy },
    ],
  },
  {
    title: ru.more.groups.body,
    items: [
      { key: 'profile', to: '/more/profile', Icon: IconUser },
      { key: 'workouts', to: '/workouts', Icon: IconPulse },
      { key: 'achievements', to: '/more/achievements', Icon: IconTrophy },
    ],
  },
  {
    title: ru.more.groups.app,
    items: [
      { key: 'reminders', to: '/more/reminders', Icon: IconBell },
      { key: 'ai', to: '/more/ai', Icon: IconSpark },
      { key: 'data', to: '/data', Icon: IconDownload },
      { key: 'storage', to: '/more/storage', Icon: IconDatabase },
      { key: 'about', to: '/more/about', Icon: IconInfo },
    ],
  },
];

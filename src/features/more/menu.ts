import type { ComponentType, SVGProps } from 'react';
import { ru } from '../../i18n/ru';
import type { Tone } from '../../ui/kit';
import {
  IconBell,
  IconBook,
  IconCloud,
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
export type MenuItem = {
  key: Key;
  to: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: Tone;
};

/** "Ещё": grouped by what you do, most used first. */
export const MORE_GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: ru.more.groups.food,
    items: [
      { key: 'foods', to: '/foods', Icon: IconTag, tone: 'sun' },
      { key: 'recipes', to: '/recipes', Icon: IconBook, tone: 'mint' },
      { key: 'templates', to: '/templates', Icon: IconCopy, tone: 'rose' },
    ],
  },
  {
    title: ru.more.groups.body,
    items: [
      { key: 'profile', to: '/more/profile', Icon: IconUser, tone: 'weight' },
      { key: 'workouts', to: '/workouts', Icon: IconPulse, tone: 'activity' },
      { key: 'achievements', to: '/more/achievements', Icon: IconTrophy, tone: 'sun' },
    ],
  },
  {
    title: ru.more.groups.app,
    items: [
      { key: 'reminders', to: '/more/reminders', Icon: IconBell, tone: 'water' },
      { key: 'ai', to: '/more/ai', Icon: IconSpark, tone: 'sky' },
      { key: 'account', to: '/account', Icon: IconCloud, tone: 'water' },
      { key: 'data', to: '/data', Icon: IconDownload, tone: 'sand' },
      { key: 'storage', to: '/more/storage', Icon: IconDatabase, tone: 'mint' },
      { key: 'about', to: '/more/about', Icon: IconInfo, tone: 'rose' },
    ],
  },
];

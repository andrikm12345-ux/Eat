import { ru } from '../i18n/ru';
import { IconDiary, IconMore, IconProgress, IconReports, IconToday } from './icons';

export const NAV_ITEMS = [
  { to: '/', label: ru.nav.today, Icon: IconToday, end: true },
  { to: '/diary', label: ru.nav.diary, Icon: IconDiary, end: false },
  { to: '/progress', label: ru.nav.progress, Icon: IconProgress, end: false },
  { to: '/reports', label: ru.nav.reports, Icon: IconReports, end: false },
  { to: '/more', label: ru.nav.more, Icon: IconMore, end: false },
] as const;

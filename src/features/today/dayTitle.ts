import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { ru } from '../../i18n/ru';

const t = ru.today;

export function dayTitle(date: string): string {
  const today = toLocalDate(new Date());
  if (date === today) return t.today;
  if (date === addDays(today, -1)) return t.yesterday;
  if (date === addDays(today, 1)) return t.tomorrow;
  return formatDateRu(date, 'EEEEEE, d MMMM');
}

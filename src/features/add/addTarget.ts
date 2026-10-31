import { useSearchParams } from 'react-router';
import { isLocalDate, toLocalDate, toLocalTime } from '../../domain/dates';
import type { LocalDate, LocalTime } from '../../domain/types';
import { useUi } from '../../state/ui';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Where new food goes: `?date=&time=`, else the selected day and the current time. */
export function useAddTarget(): { date: LocalDate; time: LocalTime; qs: string } {
  const [params] = useSearchParams();
  const selected = useUi((s) => s.date);
  const now = new Date();
  const pDate = params.get('date');
  const pTime = params.get('time');
  const date = pDate && isLocalDate(pDate) ? pDate : selected;
  const time = pTime && TIME_RE.test(pTime) ? pTime : toLocalTime(now);
  return { date, time, qs: addQs(date, time) };
}

export function addQs(date: LocalDate, time?: LocalTime): string {
  const p = new URLSearchParams({ date });
  if (time) p.set('time', time);
  return `?${p.toString()}`;
}

export const isToday = (d: LocalDate) => d === toLocalDate(new Date());

import { addDays, parseLocalDate, toLocalDate } from '../domain/dates';
import { buildIcs, byDay } from '../domain/ics';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';

/** Next date on or after `from` that falls on `weekday` (0 = Sunday). */
export function nextWeekday(from: string, weekday: number): string {
  const dow = parseLocalDate(from).getDay();
  return addDays(from, (weekday - dow + 7) % 7);
}

/** Calendar with recurring reminders built from the user's settings. */
export async function buildRemindersIcs(
  r: Repos,
  today = toLocalDate(new Date()),
): Promise<string> {
  const [weighTime, measureDay, reviewDay, reviewTime] = await Promise.all([
    r.settings.get(SETTINGS.weighTime.key, SETTINGS.weighTime.def),
    r.settings.get(SETTINGS.measureWeekday.key, SETTINGS.measureWeekday.def),
    r.settings.get(SETTINGS.reviewWeekday.key, SETTINGS.reviewWeekday.def),
    r.settings.get(SETTINGS.reviewTime.key, SETTINGS.reviewTime.def),
  ]);
  const e = ru.reminders.events;
  return buildIcs(
    [
      {
        uid: 'weigh@dnevnik.app',
        title: e.weigh,
        description: e.weighDesc,
        date: today,
        time: weighTime,
        rrule: 'FREQ=DAILY',
      },
      {
        uid: 'measure@dnevnik.app',
        title: e.measure,
        date: nextWeekday(today, measureDay),
        time: '08:00',
        rrule: `FREQ=WEEKLY;BYDAY=${byDay(measureDay)}`,
      },
      {
        uid: 'review@dnevnik.app',
        title: e.review,
        description: e.reviewDesc,
        date: nextWeekday(today, reviewDay),
        time: reviewTime,
        durationMin: 15,
        rrule: `FREQ=WEEKLY;BYDAY=${byDay(reviewDay)}`,
      },
      {
        uid: 'backup@dnevnik.app',
        title: e.backup,
        date: nextWeekday(today, reviewDay),
        time: reviewTime,
        rrule: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${byDay(reviewDay)}`,
      },
    ],
    new Date().toISOString(),
  );
}

/** Shares a file (iOS: "Save to Files"/Calendar) or downloads it. */
export async function shareOrDownload(
  name: string,
  mime: string,
  content: Blob | string,
): Promise<'shared' | 'downloaded'> {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const file = new File([blob], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch {
      /* cancelled → fall back to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

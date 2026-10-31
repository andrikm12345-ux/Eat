/** Minimal RFC 5545 calendar with recurring reminders (floating local times). */

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  /** First occurrence, local date YYYY-MM-DD and time HH:mm. */
  date: string;
  time: string;
  durationMin?: number;
  /** e.g. FREQ=DAILY or FREQ=WEEKLY;BYDAY=SU */
  rrule: string;
  /** Minutes before the event for an alert (0 = at start). */
  alarmMin?: number;
};

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 octets (UTF-8) with CRLF + space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const dt = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

export function buildIcs(events: readonly IcsEvent[], stampIso: string): string {
  const stamp = stampIso.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dnevnik//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Дневник — напоминания',
  ];
  for (const e of events) {
    const [h, m] = e.time.split(':').map(Number) as [number, number];
    const end = h * 60 + m + (e.durationMin ?? 10);
    const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt(e.date, e.time)}`,
      `DTEND:${dt(e.date, endTime)}`,
      `RRULE:${e.rrule}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      `TRIGGER:-PT${e.alarmMin ?? 0}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const byDay = (weekday: number) => DAYS[((weekday % 7) + 7) % 7] as string;

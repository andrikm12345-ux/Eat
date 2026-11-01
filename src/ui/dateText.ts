import type { LocalDate, LocalTime } from '../domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-11-01 → 01.11.2026 */
export const isoToRu = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

/** Digits typed so far → "01.11.2026" (dots are inserted for the user). */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('.');
}

/** "01.11.2026" → ISO date, or null when it is incomplete or not a real day. */
export function parseRuDate(text: string): LocalDate | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(y, mo, 0).getDate();
  return d <= last ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** Digits typed so far → "06:00". */
export function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/** "06:00" → 24-hour time, or null. */
export function parseRuTime(text: string): LocalTime | null {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}

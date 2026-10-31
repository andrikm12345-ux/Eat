import { isLocalDate } from './dates';
import { parseDecimal } from './format';
import type { LocalDate } from './types';

/** Parses CSV text (delimiter auto-detected among , ; tab; RFC 4180 quotes). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] as string;
  const delim = [';', '\t', ','].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ',',
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Serializes rows as CSV (comma, quotes when needed, CRLF). */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Accepts YYYY-MM-DD, ISO date-time, DD.MM.YYYY, DD/MM/YYYY and YYYY/MM/DD. */
export function parseDateFlexible(s: string): LocalDate | null {
  const v = s.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return norm(m[1] as string, m[2] as string, m[3] as string);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(v);
  if (m) return norm(m[3] as string, m[2] as string, m[1] as string);
  return null;
}

function norm(y: string, mo: string, d: string): LocalDate | null {
  const out = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isLocalDate(out) ? out : null;
}

export type CsvField =
  'date' | 'steps' | 'activeKcal' | 'weight' | 'workoutType' | 'duration' | 'workoutKcal';

const HINTS: Record<CsvField, RegExp> = {
  date: /^(дата|date|day|день|startdate|start date|time|время)/i,
  steps: /(шаг|step)/i,
  activeKcal: /(актив.*(ккал|кал|энерг)|active.*(kcal|cal|energy))/i,
  weight: /(вес|weight|масса|body ?mass|kg)/i,
  workoutType: /(тип|вид|type|activity|workout|тренир)/i,
  duration: /(длит|мин|duration|minutes|min)/i,
  workoutKcal: /^(ккал|kcal|calories|калори|energy)/i,
};

/** Guesses which column holds each field from header names (−1 when not found). */
export function guessColumns(headers: readonly string[]): Record<CsvField, number> {
  const out = {} as Record<CsvField, number>;
  const used = new Set<number>();
  for (const f of Object.keys(HINTS) as CsvField[]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HINTS[f].test(h.trim()));
    out[f] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

export type ImportedRow = {
  date: LocalDate;
  steps?: number;
  activeKcal?: number;
  weight?: number;
  workout?: { type: string; durationMin: number; kcal?: number };
};

/** Converts data rows using a column mapping; invalid rows are reported, not thrown. */
export function mapRows(
  rows: readonly string[][],
  cols: Record<CsvField, number>,
): { ok: ImportedRow[]; skipped: number } {
  const ok: ImportedRow[] = [];
  let skipped = 0;
  const cell = (r: readonly string[], f: CsvField) =>
    cols[f] >= 0 ? (r[cols[f]] ?? '').trim() : '';
  const num = (r: readonly string[], f: CsvField) => {
    const v = parseDecimal(cell(r, f));
    return v !== null && v >= 0 ? v : undefined;
  };
  for (const r of rows) {
    const date = parseDateFlexible(cell(r, 'date'));
    if (!date) {
      skipped++;
      continue;
    }
    const out: ImportedRow = { date };
    const steps = num(r, 'steps');
    if (steps !== undefined) out.steps = Math.round(steps);
    const active = num(r, 'activeKcal');
    if (active !== undefined) out.activeKcal = Math.round(active);
    const w = num(r, 'weight');
    if (w !== undefined && w >= 30 && w <= 300) out.weight = w;
    const dur = num(r, 'duration');
    const type = cell(r, 'workoutType');
    if (dur !== undefined && dur > 0 && (type || cols.workoutType < 0)) {
      const kcal = num(r, 'workoutKcal');
      out.workout = {
        type: type || 'Тренировка',
        durationMin: Math.round(dur),
        ...(kcal !== undefined ? { kcal: Math.round(kcal) } : {}),
      };
    }
    if (Object.keys(out).length === 1) {
      skipped++;
      continue;
    }
    ok.push(out);
  }
  return { ok, skipped };
}

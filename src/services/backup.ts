import { toCsv } from '../domain/csv';
import type { BlobRecord, LocalDate } from '../domain/types';
import { SCHEMA_V1, SCHEMA_VERSION, type TableName } from '../db/db';
import type { Repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { AI_KEYS } from '../ai/settings';
import { toLocalDate } from '../domain/dates';
import { shareOrDownload } from './ics';
import { blobToBase64 } from './images';

export const BACKUP_FORMAT = 'dnevnik-backup';
const TABLES = Object.keys(SCHEMA_V1) as TableName[];
/** Settings never exported (secrets). */
const SECRET_SETTINGS = new Set<string>([AI_KEYS.apiKey]);
/** Account session settings (token, email) never leave the device either. */
export const isSecretSetting = (key: string) =>
  SECRET_SETTINGS.has(key) || key.startsWith('account');

type SerializedBlob = Omit<BlobRecord, 'blob'> & { data: string };
export type Backup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  includesPhotos: boolean;
  tables: Partial<Record<TableName, unknown[]>>;
};

/** Full dump of every table. Photos as base64 only when asked; the API key is never included. */
export async function exportJson(r: Repos, opts: { includePhotos: boolean }): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const name of TABLES) {
    const rows = (await r.db.table(name).toArray()) as Record<string, unknown>[];
    if (name === 'settings') {
      tables.settings = rows.filter((s) => !isSecretSetting(s.key as string));
    } else if (name === 'blobs') {
      if (!opts.includePhotos) continue;
      const out: SerializedBlob[] = [];
      for (const b of rows as unknown as BlobRecord[]) {
        const { blob, ...rest } = b;
        out.push({ ...rest, data: await blobToBase64(blob) });
      }
      tables.blobs = out;
    } else tables[name] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    includesPhotos: opts.includePhotos,
    tables,
  };
}

export class BackupError extends Error {}

/** Validates the envelope of a parsed backup file. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('Файл не является JSON');
  }
  const b = data as Partial<Backup>;
  if (
    !b ||
    b.format !== BACKUP_FORMAT ||
    typeof b.schemaVersion !== 'number' ||
    typeof b.tables !== 'object' ||
    !b.tables
  ) {
    throw new BackupError('Это не резервная копия «Дневника»');
  }
  if (b.schemaVersion > SCHEMA_VERSION)
    throw new BackupError('Копия сделана более новой версией приложения');
  return b as Backup;
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const pk = (name: TableName) => (SCHEMA_V1[name].split(',')[0] as string).trim();

/**
 * Restores a backup. `replace` clears everything first (the caller exports a safety copy
 * beforehand); `merge` keeps the record with the larger `updatedAt` per primary key.
 * Secrets (API key) are never overwritten.
 */
export async function importJson(
  r: Repos,
  b: Backup,
  mode: 'replace' | 'merge',
): Promise<{ written: number }> {
  let written = 0;
  const tables = TABLES.filter((t) => Array.isArray(b.tables[t]));
  await r.db.transaction(
    'rw',
    TABLES.map((t) => r.db.table(t)),
    async () => {
      if (mode === 'replace') {
        for (const name of TABLES) {
          if (name === 'settings') {
            const keep = (await r.db.settings.toArray()).filter((s) => isSecretSetting(s.key));
            await r.db.settings.clear();
            await r.db.settings.bulkPut(keep);
          } else if (name !== 'blobs' || b.includesPhotos) await r.db.table(name).clear();
        }
      }
      for (const name of tables) {
        let rows = (b.tables[name] as Record<string, unknown>[]).filter(
          (x) => x && typeof x === 'object',
        );
        if (name === 'settings') rows = rows.filter((s) => !isSecretSetting(s.key as string));
        if (name === 'blobs') {
          rows = (rows as unknown as SerializedBlob[]).map(({ data, ...rest }) => ({
            ...rest,
            blob: base64ToBlob(data, rest.mime),
          }));
        }
        if (mode === 'merge') {
          const key = pk(name);
          const existing = new Map(
            ((await r.db.table(name).toArray()) as Record<string, unknown>[]).map((x) => [
              x[key],
              x,
            ]),
          );
          rows = rows.filter((x) => {
            const cur = existing.get(x[key]);
            return !cur || String(x.updatedAt ?? '') > String(cur.updatedAt ?? '');
          });
        }
        await r.db.table(name).bulkPut(rows);
        written += rows.length;
      }
    },
  );
  return { written };
}

/** Remembers a backup for the reminder banner and the achievement. */
export async function markBackup(r: Repos) {
  const n = await r.settings.get(SETTINGS.backupCount.key, SETTINGS.backupCount.def);
  await r.settings.set(SETTINGS.backupCount.key, n + 1);
  await r.settings.set(SETTINGS.lastBackupAt.key, new Date().toISOString());
}

export const backupFileName = (d: LocalDate) => `dnevnik-backup-${d}.json`;

/** CSV exports: diary by item, daily totals, weights, measurements, workouts. */
export async function exportCsv(r: Repos): Promise<Record<string, string>> {
  const [entries, weights, measurements, workouts, goals, metas] = await Promise.all([
    r.entries.list(),
    r.weights.list(),
    r.measurements.list(),
    r.workouts.list(),
    r.goals.list(),
    r.db.dayMeta.toArray(),
  ]);
  const { goalFor } = await import('../domain/goals');
  const sorted = entries.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const n = (v: number | undefined) => (v === undefined ? '' : Math.round(v * 10) / 10);
  const diary = [
    ['date', 'time', 'meal', 'item', 'grams', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'source'],
    ...sorted.flatMap((e) =>
      e.items.map((i) => [
        e.date,
        e.time,
        e.mealLabel ?? '',
        i.name,
        n(i.grams),
        n(i.nutrients.kcal),
        n(i.nutrients.protein),
        n(i.nutrients.fat),
        n(i.nutrients.carbs),
        n(i.nutrients.fiber),
        e.source,
      ]),
    ),
  ];
  const days = new Map<
    string,
    { kcal: number; protein: number; fat: number; carbs: number; fiber: number }
  >();
  for (const e of sorted) {
    const d = days.get(e.date) ?? { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
    d.kcal += e.totals.kcal;
    d.protein += e.totals.protein;
    d.fat += e.totals.fat;
    d.carbs += e.totals.carbs;
    d.fiber += e.totals.fiber ?? 0;
    days.set(e.date, d);
  }
  const metaBy = new Map(metas.map((m) => [m.date, m]));
  const daily = [
    [
      'date',
      'kcal',
      'protein',
      'fat',
      'carbs',
      'fiber',
      'goal_kcal',
      'water_ml',
      'steps',
      'complete',
    ],
    ...[...days.entries()].map(([d, v]) => [
      d,
      n(v.kcal),
      n(v.protein),
      n(v.fat),
      n(v.carbs),
      n(v.fiber),
      goalFor(goals, d)?.kcal ?? '',
      metaBy.get(d)?.waterMl ?? '',
      metaBy.get(d)?.steps ?? '',
      metaBy.get(d)?.complete ? 1 : 0,
    ]),
  ];
  const w = [
    ['date', 'time', 'kg', 'source'],
    ...weights
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((x) => [x.date, x.time, x.kg, x.source]),
  ];
  const m = [
    [
      'date',
      'neck_cm',
      'chest_cm',
      'waist_cm',
      'abdomen_cm',
      'hips_cm',
      'thigh_cm',
      'arm_cm',
      'body_fat_pct',
    ],
    ...measurements
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => [
        x.date,
        x.neckCm,
        x.chestCm,
        x.waistCm,
        x.abdomenCm,
        x.hipsCm,
        x.thighCm,
        x.armCm,
        x.bodyFatPct,
      ]),
  ];
  const t = [
    ['date', 'time', 'type', 'duration_min', 'kcal', 'source'],
    ...workouts
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((x) => [x.date, x.time, x.type, x.durationMin, x.kcal, x.source]),
  ];
  return {
    'diary-items.csv': toCsv(diary),
    'daily-totals.csv': toCsv(daily),
    'weights.csv': toCsv(w),
    'measurements.csv': toCsv(m),
    'workouts.csv': toCsv(t),
  };
}

/** Exports a JSON backup (Web Share or download) and records it for the reminder. */
export async function saveBackup(r: Repos, includePhotos: boolean) {
  const b = await exportJson(r, { includePhotos });
  await shareOrDownload(
    backupFileName(toLocalDate(new Date())),
    'application/json',
    JSON.stringify(b),
  );
  await markBackup(r);
}

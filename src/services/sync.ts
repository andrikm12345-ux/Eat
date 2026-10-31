import { SCHEMA_V1, type TableName } from '../db/db';
import type { Repos } from '../db/repos';
import { BASE_FOODS_SETTING } from '../db/baseFoods';
import { ACCOUNT, getSession, signOut } from './account';
import { exportJson, importJson, isSecretSetting, parseBackup, type Backup } from './backup';

/** Tables that are derived or heavy and are rebuilt on each device. */
const LOCAL_ONLY: TableName[] = ['tdeeHistory', 'aiRuns', 'blobs'];
const SYNCED = (Object.keys(SCHEMA_V1) as TableName[]).filter((t) => !LOCAL_ONLY.includes(t));

export type SyncResult =
  | { ok: true; pulled: number; pushed: boolean }
  | { ok: false; reason: 'signed_out' | 'expired' | 'network' | 'too_big' | 'server' };

/** What goes to the cloud: user data only — no photos, caches, secrets or the bundled catalog. */
export async function buildSnapshot(r: Repos): Promise<Backup> {
  const full = await exportJson(r, { includePhotos: false });
  const tables: Backup['tables'] = {};
  for (const name of SYNCED) {
    let rows = (full.tables[name] ?? []) as Record<string, unknown>[];
    if (name === 'settings')
      rows = rows.filter(
        (s) =>
          s.key !== BASE_FOODS_SETTING &&
          !isSecretSetting(s.key as string) &&
          !String(s.key).startsWith('ai'),
      );
    if (name === 'foods') rows = rows.filter((f) => !(f.source === 'base' && !f.useCount));
    tables[name] = rows;
  }
  return { ...full, tables };
}

const stripTables = (b: Backup) => JSON.stringify(b.tables);

/** Two-way merge with the cloud copy: pull, merge by `updatedAt`, push if anything differs. */
export async function syncNow(r: Repos): Promise<SyncResult> {
  const session = await getSession(r);
  if (!session) return { ok: false, reason: 'signed_out' };
  const headers = { authorization: `Bearer ${session.token}` };
  try {
    const res = await fetch('/api/sync', { headers });
    if (res.status === 401) {
      await signOut(r);
      return { ok: false, reason: 'expired' };
    }
    if (!res.ok) return { ok: false, reason: 'server' };
    const body = await res.text();
    let pulled = 0;
    let remoteTables: string | null = null;
    if (!(JSON.parse(body) as { empty?: boolean }).empty) {
      const remote = parseBackup(body);
      remoteTables = stripTables({ ...remote, tables: pick(remote.tables) });
      pulled = (await importJson(r, { ...remote, tables: pick(remote.tables) }, 'merge')).written;
    }
    const snapshot = await buildSnapshot(r);
    let pushed = false;
    if (remoteTables !== stripTables(snapshot)) {
      const put = await fetch('/api/sync', {
        method: 'PUT',
        headers,
        body: JSON.stringify(snapshot),
      });
      if (put.status === 401) {
        await signOut(r);
        return { ok: false, reason: 'expired' };
      }
      if (put.status === 413) return { ok: false, reason: 'too_big' };
      if (!put.ok) return { ok: false, reason: 'server' };
      pushed = true;
    }
    await r.settings.set(ACCOUNT.lastSync, new Date().toISOString());
    return { ok: true, pulled, pushed };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Only synced tables (a stale or foreign file cannot inject local-only ones). */
function pick(tables: Backup['tables']): Backup['tables'] {
  const out: Backup['tables'] = {};
  for (const t of SYNCED) if (tables[t]) out[t] = tables[t];
  return out;
}

/**
 * Keeps this device in sync while signed in: on start, when coming back online or to the
 * foreground, and a few seconds after any local change. Returns an unsubscribe function.
 */
export function startAccountSync(r: Repos, delayMs = 4000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      if (await getSession(r)) await syncNow(r);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), delayMs);
  };

  const onChange = (primKey: unknown) => {
    if (typeof primKey === 'string' && (isSecretSetting(primKey) || primKey === 'lastBackupAt'))
      return;
    if (!running) schedule();
  };
  const hooks: (() => void)[] = [];
  for (const name of SYNCED) {
    const t = r.db.table(name);
    const created = (pk: unknown) => onChange(pk);
    const updated = (_m: unknown, pk: unknown) => onChange(pk);
    t.hook('creating', created);
    t.hook('updating', updated);
    t.hook('deleting', created);
    hooks.push(() => {
      t.hook('creating').unsubscribe(created);
      t.hook('updating').unsubscribe(updated);
      t.hook('deleting').unsubscribe(created);
    });
  }
  const wake = () => schedule();
  const visible = () => {
    if (document.visibilityState === 'visible') schedule();
  };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', visible);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', visible);
    hooks.forEach((h) => h());
  };
}

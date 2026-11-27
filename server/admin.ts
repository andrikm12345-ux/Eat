import { userIdFor } from './auth.js';
import { session } from './sharedAi.js';
import { json } from './http.js';
import type { Deps } from './types.js';

type Meta = { login?: string; createdAt?: number; lastLogin?: number; lastSeen?: number };
type Row = { id?: string; deletedAt?: string; [k: string]: unknown };
type Snapshot = { exportedAt?: string; tables?: Record<string, Row[] | undefined> };

const parse = <T>(text: string | null): T | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const alive = (rows: Row[] | undefined) => (rows ?? []).filter((r) => !r.deletedAt);

/** «Что приготовить» history the app keeps in its settings (src/services/cookHistory.ts). */
const COOK_HISTORY = 'cookHistory';
/** Searches the administrator removed from HIS view (the person's own data is not touched). */
const hiddenPath = (uid: string) => `admin/cook-hidden/${uid}.json`;
const HIDE_ID = /^[\w-]{4,40}$/;

async function readHidden(d: Deps, uid: string): Promise<string[]> {
  const v = parse<{ ids?: unknown }>(await d.store.get(hiddenPath(uid)));
  return Array.isArray(v?.ids) ? v.ids.filter((x): x is string => typeof x === 'string') : [];
}

function cookHistory(snap: Snapshot | null, hidden: readonly string[] = []): unknown[] {
  const row = alive(snap?.tables?.settings).find((r) => r.key === COOK_HISTORY);
  const all = Array.isArray(row?.value) ? (row.value as { id?: unknown }[]) : [];
  return all.filter((h) => !(typeof h?.id === 'string' && hidden.includes(h.id)));
}

/**
 * GET (administrator only) → every account: login, registered, last sign-in, last sync, number
 * of meal entries. With ?id=<account> → that account's diary (read only), and the look is logged.
 */
export async function adminUsers(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!s.admin) return json({ error: 'forbidden' }, 403);
  if (!d.store.list) return json({ error: 'unsupported' }, 501);

  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    if (!/^[0-9a-f]{8,64}$/.test(id)) return json({ error: 'bad_id' }, 400);
    const meta = parse<Meta>(await d.store.get(`meta/${id}.json`));
    const snap = parse<Snapshot>(await d.store.get(`users/${id}.json`));
    if (!meta && !snap) return json({ error: 'not_found' }, 404);
    const t = snap?.tables ?? {};
    try {
      await d.store.put(
        `audit/${d.now()}-${s.userId.slice(0, 8)}.json`,
        JSON.stringify({ at: d.now(), admin: s.userId, viewed: id }),
      );
    } catch (e) {
      console.error('audit failed', e);
    }
    return json({
      login: meta?.login ?? null,
      exportedAt: snap?.exportedAt ?? null,
      profile: alive(t.profile)[0] ?? null,
      goals: alive(t.goals),
      entries: alive(t.entries),
      weights: alive(t.weights),
      dayMeta: alive(t.dayMeta),
      cook: cookHistory(snap, await readHidden(d, id)),
    });
  }

  const ids = (await d.store.list('meta/')).map((p) =>
    p.slice('meta/'.length).replace(/\.json$/, ''),
  );
  const users = await Promise.all(
    ids.map(async (uid) => {
      const meta = parse<Meta>(await d.store.get(`meta/${uid}.json`)) ?? {};
      const snap = parse<Snapshot>(await d.store.get(`users/${uid}.json`));
      return {
        id: uid,
        login: meta.login ?? null,
        createdAt: meta.createdAt ?? null,
        lastLogin: Math.max(meta.lastLogin ?? 0, meta.lastSeen ?? 0) || null,
        lastSync: snap?.exportedAt ?? null,
        entries: alive(snap?.tables?.entries).length,
        cookSearches: cookHistory(snap, await readHidden(d, uid)).length,
        me: uid === s.userId,
        // An account of the old host that has not signed in on the new one yet.
        legacy: !!meta.login && userIdFor(d.secret, meta.login) !== uid,
      };
    }),
  );
  // A leftover old-host record of someone who already has an account here is not shown twice.
  const current = new Set(users.filter((u) => !u.legacy).map((u) => u.login));
  const shown = users.filter((u) => !(u.legacy && current.has(u.login)));
  shown.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  // People known from before a storage move who have not opened the app since.
  const here = new Set(shown.map((u) => u.login).filter(Boolean));
  const pending = (d.knownLogins ?? []).filter((l) => !here.has(l));
  return json({ users: shown, pending });
}

/** Only accounts the assistant made while testing carry this login prefix. */
export const TEST_LOGIN_PREFIX = 'claude-test';

/**
 * DELETE (administrator only) → removes every account whose login starts with `claude-test`
 * together with its data. Nobody else can be removed this way, and never the caller.
 */
export async function adminRemoveTestUsers(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!s.admin) return json({ error: 'forbidden' }, 403);
  if (!d.store.list || !d.store.remove) return json({ error: 'unsupported' }, 501);
  const ids = (await d.store.list('meta/')).map((p) =>
    p.slice('meta/'.length).replace(/\.json$/, ''),
  );
  let removed = 0;
  for (const uid of ids) {
    if (uid === s.userId) continue;
    const meta = parse<Meta>(await d.store.get(`meta/${uid}.json`));
    if (!meta?.login?.startsWith(TEST_LOGIN_PREFIX)) continue;
    for (const path of [
      `meta/${uid}.json`,
      `creds/${uid}.json`,
      `attempts/${uid}-`,
      `users/${uid}.json`,
      `usage/${uid}/`,
      `search-usage/${uid}/`,
      `ai-jobs/${uid}/`,
    ])
      await d.store.remove(path);
    removed++;
  }
  return json({ removed });
}

/**
 * POST (administrator only) {id, hide?: [searchId], unhide?: [searchId]} → hides «Что приготовить»
 * searches of that account in the administrator's view, or brings them back. The account's own
 * data and the diary are not touched, so a hidden search does not come back with the next sync.
 */
export async function adminCookHide(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!s.admin) return json({ error: 'forbidden' }, 403);
  let body: { id?: unknown; hide?: unknown; unhide?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8,64}$/.test(body.id))
    return json({ error: 'bad_id' }, 400);
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && HIDE_ID.test(x)) : [];
  const hide = ids(body.hide).slice(0, 200);
  const unhide = new Set(ids(body.unhide).slice(0, 200));
  const next = [...new Set([...(await readHidden(d, body.id)), ...hide])]
    .filter((x) => !unhide.has(x))
    .slice(-2000);
  await d.store.put(hiddenPath(body.id), JSON.stringify({ ids: next }));
  return json({ hidden: next.length });
}

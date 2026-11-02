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
        me: uid === s.userId,
      };
    }),
  );
  users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return json({ users });
}

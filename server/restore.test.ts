import { describe, expect, it } from 'vitest';
import { createSession, userIdFor } from './auth.js';
import { getSync, login, putSync, register, setRestoredPassword } from './handlers.js';
import { redisConfigFromEnv, redisStore } from './redisStore.js';
import type { Deps, Store } from './types.js';

const SECRET = 'x'.repeat(40);
const T0 = Date.UTC(2026, 10, 23, 12, 0, 0);

const memoryStore = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
};
const deps = (over: Partial<Deps> = {}): Deps => ({
  secret: SECRET,
  store: memoryStore(),
  now: () => T0,
  signupOpen: true,
  ...over,
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const auth = (token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  ...extra,
});
const snapshot = JSON.stringify({ format: 'dnevnik-backup', tables: { entries: [] } });

/** A token the OLD storage issued a month ago for "defeni". */
const oldToken = () => createSession(SECRET, userIdFor(SECRET, 'defeni'), T0 - 30 * 86_400_000);

describe('accounts restored after the storage was replaced', () => {
  it('a valid old session recreates the account and keeps working (no password yet)', async () => {
    const d = deps({ restoreUntil: T0 + 45 * 86_400_000 });
    const token = oldToken();
    const put = await putSync(
      d,
      new Request('http://x/api/sync', {
        method: 'PUT',
        headers: auth(token, { 'x-account-login': 'defeni' }),
        body: snapshot,
      }),
    );
    expect(put.status).toBe(200);
    const get = await getSync(
      d,
      new Request('http://x/api/sync', { headers: auth(token, { 'x-account-login': 'defeni' }) }),
    );
    expect(get.status).toBe(200);
    expect(await get.text()).toBe(snapshot);
    // the app is told the account has no password
    expect(get.headers.get('x-account-restored')).toBe('1');
  });

  it('nothing is restored without the window, with a forged token or an expired one', async () => {
    const forged = createSession('y'.repeat(40), userIdFor(SECRET, 'defeni'), T0 - 1000);
    const get = (d: Deps, token: string) =>
      getSync(d, new Request('http://x/api/sync', { headers: auth(token) }));
    expect((await get(deps(), oldToken())).status).toBe(401); // feature off by default
    const open = deps({ restoreUntil: T0 + 1000 });
    expect((await get(open, forged)).status).toBe(401);
    const closed = deps({ restoreUntil: T0 - 1 });
    expect((await get(closed, oldToken())).status).toBe(401);
  });

  it('the password cannot be guessed on a restored account', async () => {
    const d = deps({ restoreUntil: T0 + 1000 });
    await getSync(d, new Request('http://x/api/sync', { headers: auth(oldToken()) }));
    for (const pw of ['', 'password', '12345678'])
      expect((await login(d, post({ login: 'defeni', password: pw.padEnd(8, 'x') }))).status).toBe(
        401,
      );
    // and nobody can register the login on top of it
    expect((await register(d, post({ login: 'defeni', password: 'hunter2hunter2' }))).status).toBe(
      409,
    );
  });

  it('the owner sets the first password and gets a recovery code; then logs in normally', async () => {
    const d = deps({ restoreUntil: T0 + 1000 });
    const token = oldToken();
    await getSync(d, new Request('http://x/api/sync', { headers: auth(token) }));
    const short = await setRestoredPassword(d, post({ newPassword: 'short' }, auth(token)));
    expect(short.status).toBe(400);
    const res = await setRestoredPassword(d, post({ newPassword: 'newpassword1' }, auth(token)));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { recoveryCode: string }).recoveryCode).toMatch(/^\w{5}-/);
    expect((await login(d, post({ login: 'defeni', password: 'newpassword1' }))).status).toBe(200);
    // the old device stays signed in and the account no longer reports "restored"
    const again = await getSync(d, new Request('http://x/api/sync', { headers: auth(token) }));
    expect(again.status).toBe(200);
    expect(again.headers.get('x-account-restored')).toBeNull();
    // and the call cannot be repeated by anyone holding a session
    expect(
      (await setRestoredPassword(d, post({ newPassword: 'otherpassword1' }, auth(token)))).status,
    ).toBe(409);
  });

  it('someone who registered the login first does not get the owner’s old session, nor the owner their data', async () => {
    const d = deps({ restoreUntil: T0 + 1000 });
    // a stranger registers "defeni" in the empty storage a minute after the move
    const later = { ...d, now: () => T0 - 29 * 86_400_000 };
    expect(
      (await register(later, post({ login: 'defeni', password: 'strangerpass1' }))).status,
    ).toBe(200);
    // the owner's older session (issued before that registration) is refused, not merged
    const get = await getSync(d, new Request('http://x/api/sync', { headers: auth(oldToken()) }));
    expect(get.status).toBe(401);
  });
});

describe('Redis store (Upstash REST)', () => {
  /** A tiny fake of the REST endpoint: SET/GET/MGET/DEL/SCAN/KEYS on a Map. */
  const fake = () => {
    const kv = new Map<string, string>();
    const calls: string[][] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(String(init.body)) as (string | number)[];
      calls.push(cmd.map(String));
      const [op, ...a] = cmd.map((x) => (typeof x === 'number' ? x : String(x)));
      const pat = (p: string) =>
        new RegExp(`^${String(p).replace(/\\(.)/g, '$1').replace(/\*$/, '')}`);
      let result: unknown = null;
      if (op === 'SET') kv.set(String(a[0]), String(a[1]));
      else if (op === 'GET') result = kv.get(String(a[0])) ?? null;
      else if (op === 'MGET') result = a.map((k) => kv.get(String(k)) ?? null);
      else if (op === 'DEL') result = a.filter((k) => kv.delete(String(k))).length;
      else if (op === 'KEYS') result = [...kv.keys()].filter((k) => pat(String(a[0])).test(k));
      else if (op === 'SCAN')
        result = ['0', [...kv.keys()].filter((k) => pat(String(a[2])).test(k))];
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;
    return { kv, calls, store: redisStore({ url: 'https://r.example', token: 't', fetchImpl }) };
  };

  it('stores, reads, lists and removes by prefix', async () => {
    const { store } = fake();
    await store.put('creds/a.json', '{"a":1}');
    await store.put('creds/b.json', '{"b":1}');
    await store.put('meta/a.json', '{}');
    expect(await store.get('creds/a.json')).toBe('{"a":1}');
    expect(await store.get('nothing')).toBeNull();
    expect((await store.list!('creds/')).sort()).toEqual(['creds/a.json', 'creds/b.json']);
    expect(await store.remove!('creds/')).toBe(2);
    expect(await store.get('creds/a.json')).toBeNull();
    expect(await store.get('meta/a.json')).toBe('{}');
  });

  it('a text bigger than one request is stored in pieces and read back whole', async () => {
    const { store, kv } = fake();
    const big = 'я'.repeat(1_700_000);
    await store.put('users/u.json', big);
    expect(kv.size).toBeGreaterThan(2);
    expect(await store.get('users/u.json')).toBe(big);
    // listing shows only the path, not the pieces
    expect(await store.list!('users/')).toEqual(['users/u.json']);
  });

  it('an error from the service is raised, not swallowed', async () => {
    const store = redisStore({
      url: 'https://r.example',
      token: 't',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: 'ERR max requests limit exceeded' }), {
          status: 429,
        })) as unknown as typeof fetch,
    });
    await expect(store.get('x')).rejects.toThrow(/redis/);
  });

  it('configuration comes from the Vercel integration or Upstash names', () => {
    expect(redisConfigFromEnv({ KV_REST_API_URL: 'https://a/', KV_REST_API_TOKEN: 't' })).toEqual({
      url: 'https://a',
      token: 't',
    });
    expect(
      redisConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 'u' }),
    ).toEqual({ url: 'https://b', token: 'u' });
    expect(redisConfigFromEnv({})).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { backup, open, seal, type Sealed } from './backup.js';
import type { Deps, Store } from './types.js';

const SECRET = 's'.repeat(40);
const TOKEN = 't'.repeat(32);

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (p) => data.get(p) ?? null,
    put: async (p, b) => void data.set(p, b),
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
};
const deps = (secret = SECRET, store: Store = memory()): Deps => ({
  secret,
  store,
  now: () => 1_000,
  signupOpen: true,
});
const call = (d: Deps, method: string, qs = '', token: string | null = TOKEN, body?: unknown) =>
  backup(
    d,
    new Request(`http://x/api/backup${qs}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    TOKEN,
  );

describe('encrypted backup', () => {
  it('seals and opens; a wrong key or a damaged file does not open', () => {
    const files = { 'creds/a.json': '{"hash":"h"}', 'users/b.json': 'я'.repeat(1000) };
    const s = seal(SECRET, 'creds/', files, 5);
    expect(JSON.stringify(s)).not.toContain('hash');
    expect(open(SECRET, s)).toEqual(files);
    expect(() => open('o'.repeat(40), s)).toThrow();
    expect(() => open(SECRET, { ...s, data: s.data.slice(0, -8) + 'AAAAAAAA' })).toThrow();
  });

  it('does not exist without a token, and wants the right one', async () => {
    const d = deps();
    const none = await backup(d, new Request('http://x/api/backup?prefix=creds/'), undefined);
    expect(none.status).toBe(404);
    expect((await call(d, 'GET', '?prefix=creds/', null)).status).toBe(401);
    expect((await call(d, 'GET', '?prefix=creds/', 'x'.repeat(32))).status).toBe(401);
    expect((await call(d, 'GET', '?prefix=creds/')).status).toBe(200);
  });

  it('a short token is refused even when it matches', async () => {
    const res = await backup(
      deps(),
      new Request('http://x/api/backup?prefix=creds/', {
        headers: { authorization: 'Bearer abc' },
      }),
      'abc',
    );
    expect(res.status).toBe(401);
  });

  it('gives only the allowed folders, never counters or everything', async () => {
    const d = deps();
    await d.store.put('creds/a.json', 'C');
    await d.store.put('users/ab.json', 'U');
    await d.store.put('attempts/x.json', 'A');
    expect((await call(d, 'GET', '?prefix=attempts/')).status).toBe(400);
    expect((await call(d, 'GET', '')).status).toBe(400);
    const res = await call(d, 'GET', '?prefix=users/a');
    expect(open(SECRET, (await res.json()) as Sealed)).toEqual({ 'users/ab.json': 'U' });
  });

  it('restores through the server into an empty storage', async () => {
    const old = deps();
    await old.store.put('creds/a.json', '{"hash":"h"}');
    await old.store.put('meta/a.json', '{"login":"ivan"}');
    const parts = [
      (await (await call(old, 'GET', '?prefix=creds/')).json()) as Sealed,
      (await (await call(old, 'GET', '?prefix=meta/')).json()) as Sealed,
    ];
    const fresh = memory();
    const d = deps(SECRET, fresh);
    for (const p of parts) expect((await call(d, 'POST', '', TOKEN, p)).status).toBe(200);
    expect(fresh.data.get('creds/a.json')).toBe('{"hash":"h"}');
    expect(fresh.data.get('meta/a.json')).toBe('{"login":"ivan"}');
  });

  it('a backup from another AUTH_SECRET is refused and writes nothing; foreign paths are skipped', async () => {
    const other = seal('z'.repeat(40), 'creds/', { 'creds/a.json': 'x' }, 1);
    const fresh = memory();
    const d = deps(SECRET, fresh);
    expect((await call(d, 'POST', '', TOKEN, other)).status).toBe(422);
    expect(fresh.data.size).toBe(0);
    const sneaky = seal(
      SECRET,
      'creds/',
      { 'attempts/x.json': 'a', 'creds/../x': 'b', 'creds/ok.json': 'c' },
      1,
    );
    const res = await call(d, 'POST', '', TOKEN, sneaky);
    expect(((await res.json()) as { written: number }).written).toBe(1);
    expect([...fresh.data.keys()]).toEqual(['creds/ok.json']);
  });
});

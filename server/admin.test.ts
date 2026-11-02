import { describe, expect, it } from 'vitest';
import { adminUsers } from './admin.js';
import { getSync, login, putSync, register } from './handlers.js';
import { userIdFor } from './auth.js';
import type { Deps, Store } from './types.js';

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (p) => data.get(p) ?? null,
    put: async (p, b) => void data.set(p, b),
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
}

const SECRET = 's'.repeat(40);
const setup = () => {
  const d: Deps = {
    secret: SECRET,
    store: memoryStore(),
    now: () => Date.UTC(2026, 10, 1, 12),
    signupOpen: true,
    adminLogins: ['blackjack'],
  };
  return d;
};
const post = (body: unknown, token?: string) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (token?: string, qs = '') =>
  new Request(`http://x/api/admin${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
async function signUp(d: Deps, name: string) {
  const res = await register(d, post({ login: name, password: 'password1' }));
  return ((await res.json()) as { token: string }).token;
}

describe('administrator view of the accounts', () => {
  it('is closed to everybody but the administrator', async () => {
    const d = setup();
    const user = await signUp(d, 'ivan');
    expect((await adminUsers(d, get())).status).toBe(401);
    expect((await adminUsers(d, get(user))).status).toBe(403);
    expect((await adminUsers(d, get(user, `?id=${userIdFor(SECRET, 'blackjack')}`))).status).toBe(
      403,
    );
  });

  it('lists accounts with login, registration and number of entries', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    const snap = {
      format: 'dnevnik-backup',
      exportedAt: '2026-11-01T10:00:00.000Z',
      tables: { entries: [{ id: 'a' }, { id: 'b', deletedAt: 'x' }] },
    };
    await putSync(
      d,
      new Request('http://x', {
        method: 'PUT',
        headers: { authorization: `Bearer ${user}` },
        body: JSON.stringify(snap),
      }),
    );
    const res = await adminUsers(d, get(admin));
    const { users } = (await res.json()) as {
      users: { login: string; entries: number; me: boolean; lastSync: string | null }[];
    };
    expect(users.map((u) => u.login).sort()).toEqual(['blackjack', 'ivan']);
    const ivan = users.find((u) => u.login === 'ivan')!;
    expect(ivan).toMatchObject({ entries: 1, me: false, lastSync: snap.exportedAt });
    expect(users.find((u) => u.login === 'blackjack')!.me).toBe(true);
  });

  it('returns one diary without deleted rows and logs the look', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    const snap = {
      format: 'dnevnik-backup',
      tables: {
        entries: [
          { id: 'a', date: '2026-11-01' },
          { id: 'b', deletedAt: 'x' },
        ],
        goals: [{ id: 'g', kcal: 2000 }],
        settings: [{ key: 'secret', value: 'nope' }],
      },
    };
    await putSync(
      d,
      new Request('http://x', {
        method: 'PUT',
        headers: { authorization: `Bearer ${user}` },
        body: JSON.stringify(snap),
      }),
    );
    const id = userIdFor(SECRET, 'ivan');
    const res = await adminUsers(d, get(admin, `?id=${id}`));
    const body = (await res.json()) as { login: string; entries: unknown[]; goals: unknown[] };
    expect(body.login).toBe('ivan');
    expect(body.entries).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('nope');
    const store = d.store as ReturnType<typeof memoryStore>;
    expect([...store.data.keys()].some((k) => k.startsWith('audit/'))).toBe(true);
    expect((await adminUsers(d, get(admin, '?id=zz'))).status).toBe(400);
    expect((await adminUsers(d, get(admin, '?id=' + 'a'.repeat(16)))).status).toBe(404);
  });

  it('a sign-in records the login of an older account', async () => {
    const d = setup();
    const store = d.store as ReturnType<typeof memoryStore>;
    await signUp(d, 'blackjack');
    store.data.delete(`meta/${userIdFor(SECRET, 'blackjack')}.json`);
    await login(d, post({ login: 'blackjack', password: 'password1' }));
    expect(store.data.has(`meta/${userIdFor(SECRET, 'blackjack')}.json`)).toBe(true);
  });
});

describe('last visit', () => {
  it('a sync shows an account that never signed in again, and the login must match', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    const store = d.store as ReturnType<typeof memoryStore>;
    store.data.delete(`meta/${userIdFor(SECRET, 'ivan')}.json`);
    const sync = (token: string, name: string) =>
      new Request('http://x', {
        headers: { authorization: `Bearer ${token}`, 'x-account-login': name },
      });
    // Someone else's name in the header changes nothing.
    await getSync(d, sync(user, 'blackjack'));
    expect(store.data.has(`meta/${userIdFor(SECRET, 'ivan')}.json`)).toBe(false);
    await getSync(d, sync(user, 'ivan'));
    const res = await adminUsers(d, get(admin));
    const { users } = (await res.json()) as { users: { login: string; lastLogin: number }[] };
    expect(users.map((u) => u.login).sort()).toEqual(['blackjack', 'ivan']);
  });
});

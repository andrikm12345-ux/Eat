import { describe, expect, it } from 'vitest';
import { adminCookHide, adminRemoveTestUsers, adminUsers } from './admin.js';
import { getSync, login, putSync, register } from './handlers.js';
import { parseUserLabels } from './deps.js';
import { userIdFor } from './auth.js';
import type { Deps, Store } from './types.js';

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (p) => data.get(p) ?? null,
    put: async (p, b) => void data.set(p, b),
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
    remove: async (prefix) => {
      const hit = [...data.keys()].filter((k) => k.startsWith(prefix));
      hit.forEach((k) => data.delete(k));
      return hit.length;
    },
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

describe('personal button texts', () => {
  it('only the named person gets the header; malformed settings are ignored', async () => {
    const d = setup();
    d.userLabels = parseUserLabels(
      JSON.stringify({ Crimor: { weigh: '  Вздимониться  ', evil: 'x' } }),
    );
    expect(d.userLabels).toEqual({ crimor: { weigh: 'Вздимониться' } });
    const crimor = await signUp(d, 'crimor');
    const other = await signUp(d, 'ivan');
    const get1 = (t: string) =>
      new Request('http://x', { headers: { authorization: `Bearer ${t}` } });
    const mine = await getSync(d, get1(crimor));
    expect(JSON.parse(decodeURIComponent(mine.headers.get('x-ui-labels') ?? ''))).toEqual({
      weigh: 'Вздимониться',
    });
    expect((await getSync(d, get1(other))).headers.get('x-ui-labels')).toBeNull();
    expect(parseUserLabels('not json')).toEqual({});
    expect(parseUserLabels(undefined)).toEqual({});
    expect(
      parseUserLabels(JSON.stringify({ a: { weigh: 'x'.repeat(100) } })).a?.weigh,
    ).toHaveLength(30);
  });
});

describe('removing test accounts', () => {
  const del = (token?: string) =>
    new Request('http://x', {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('removes only claude-test-* accounts and their data, and only for the administrator', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    await signUp(d, 'claude-test-1a2b3c');
    await signUp(d, 'claude-test-ffffff');
    await signUp(d, 'claude-test2');
    const store = d.store as ReturnType<typeof memoryStore>;
    const testId = userIdFor(SECRET, 'claude-test-1a2b3c');
    store.data.set(`usage/${testId}/2026-11-01.json`, '{}');
    store.data.set(`ai-jobs/${testId}/j.json`, '{}');

    expect((await adminRemoveTestUsers(d, del())).status).toBe(401);
    expect((await adminRemoveTestUsers(d, del(user))).status).toBe(403);
    const res = await adminRemoveTestUsers(d, del(admin));
    expect(await res.json()).toEqual({ removed: 3 });
    expect([...store.data.keys()].some((k) => k.includes(testId))).toBe(false);
    const left = (await (await adminUsers(d, get(admin))).json()) as { users: { login: string }[] };
    expect(left.users.map((u) => u.login).sort()).toEqual(['blackjack', 'ivan']);
  });
});

describe('«Что приготовить» in the administrator view', () => {
  it('shows what a person wrote in and what the AI gave back, to the administrator only', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    const history = [
      { id: 'h1', at: '2026-11-20T10:00:00.000Z', pantry: 'творог, мука', dishes: [] },
    ];
    await putSync(
      d,
      new Request('http://x', {
        method: 'PUT',
        headers: { authorization: `Bearer ${user}` },
        body: JSON.stringify({
          format: 'dnevnik-backup',
          tables: {
            settings: [
              { key: 'cookHistory', value: history, updatedAt: '2026-11-20T10:00:00.000Z' },
            ],
          },
        }),
      }),
    );
    const id = userIdFor(SECRET, 'ivan');
    expect((await adminUsers(d, get(user, `?id=${id}`))).status).toBe(403);
    const one = (await (await adminUsers(d, get(admin, `?id=${id}`))).json()) as { cook: unknown };
    expect(one.cook).toEqual(history);
    const list = (await (await adminUsers(d, get(admin))).json()) as {
      users: { login: string; cookSearches: number }[];
    };
    expect(list.users.find((u) => u.login === 'ivan')?.cookSearches).toBe(1);
    expect(list.users.find((u) => u.login === 'blackjack')?.cookSearches).toBe(0);
  });
});

describe('deleting «Что приготовить» days in the administrator view', () => {
  const h = (id: string) => ({ id, at: '2026-11-20T10:00:00.000Z', pantry: id, dishes: [] });
  const send = (d: Deps, token: string, body: unknown) =>
    adminCookHide(
      d,
      new Request('http://x/api/admin', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const upload = (d: Deps, token: string, history: unknown[]) =>
    putSync(
      d,
      new Request('http://x', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          format: 'dnevnik-backup',
          tables: { settings: [{ key: 'cookHistory', value: history }] },
        }),
      }),
    );

  it('removes searches from the administrator view only; they stay gone after the person syncs again', async () => {
    const d = setup();
    const admin = await signUp(d, 'blackjack');
    const user = await signUp(d, 'ivan');
    await upload(d, user, [h('s-aaaa'), h('s-bbbb'), h('s-cccc')]);
    const id = userIdFor(SECRET, 'ivan');
    const view = async () =>
      (
        (await (await adminUsers(d, get(admin, `?id=${id}`))).json()) as { cook: { id: string }[] }
      ).cook.map((x) => x.id);
    expect(await view()).toEqual(['s-aaaa', 's-bbbb', 's-cccc']);

    expect((await send(d, user, { id, hide: ['s-aaaa'] })).status).toBe(403);
    expect((await send(d, admin, { id: 'zz', hide: ['s-aaaa'] })).status).toBe(400);
    expect(await (await send(d, admin, { id, hide: ['s-aaaa', 's-bbbb', '../x'] })).json()).toEqual(
      {
        hidden: 2,
      },
    );
    expect(await view()).toEqual(['s-cccc']);
    // The person's phone sends its whole history again: the removed days do not come back.
    await upload(d, user, [h('s-aaaa'), h('s-bbbb'), h('s-cccc'), h('s-dddd')]);
    expect(await view()).toEqual(['s-cccc', 's-dddd']);
    // The person's own data is intact.
    const own = (await (
      await getSync(d, new Request('http://x', { headers: { authorization: `Bearer ${user}` } }))
    ).json()) as {
      tables: { settings: { value: unknown[] }[] };
    };
    expect(own.tables.settings[0]!.value).toHaveLength(4);
    // The count in the list follows the view; "undo" brings them back.
    const count = async () =>
      (
        (await (await adminUsers(d, get(admin))).json()) as {
          users: { login: string; cookSearches: number }[];
        }
      ).users.find((u) => u.login === 'ivan')!.cookSearches;
    expect(await count()).toBe(2);
    await send(d, admin, { id, unhide: ['s-aaaa'] });
    expect(await view()).toEqual(['s-aaaa', 's-cccc', 's-dddd']);
    expect(await count()).toBe(3);
  });
});

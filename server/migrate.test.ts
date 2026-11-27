import { describe, expect, it } from 'vitest';
import { createSession, sessionInfo, userIdFor } from './auth.js';
import { adminUsers } from './admin.js';
import { getSync, login, putSync, register, resetPassword } from './handlers.js';
import type { Deps, Store } from './types.js';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const T0 = Date.UTC(2026, 10, 28, 12);

const memory = (): Store & { data: Map<string, string> } => {
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
};
const deps = (secret: string, store: Store, over: Partial<Deps> = {}): Deps => ({
  secret,
  store,
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
const snapshot = JSON.stringify({ format: 'dnevnik-backup', tables: { entries: [{ id: 'e1' }] } });

/** An account made on the old host (secret OLD) with a password and a diary in the cloud. */
async function oldAccount(store: Store, name = 'ivan') {
  const d = deps(OLD, store);
  const reg = await register(d, post({ login: name, password: 'password-one' }));
  const { token, recoveryCode } = (await reg.json()) as { token: string; recoveryCode: string };
  await putSync(
    d,
    new Request('http://x/api/sync', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: snapshot,
    }),
  );
  return { token, recoveryCode };
}

describe('accounts after the move to another host (new AUTH_SECRET)', () => {
  it('the old password works on the new host, and the diary comes along', async () => {
    const store = memory();
    await oldAccount(store);
    const d = deps(NEW, store);
    const res = await login(d, post({ login: 'ivan', password: 'password-one' }));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    // the token is made with the NEW secret and the new id
    expect(sessionInfo(NEW, token, T0)?.userId).toBe(userIdFor(NEW, 'ivan'));
    const sync = await getSync(
      d,
      new Request('http://x/api/sync', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(await sync.text()).toBe(snapshot);
    // and from now on it is a normal account of the new host
    expect((await login(d, post({ login: 'ivan', password: 'password-one' }))).status).toBe(200);
  });

  it('a wrong password does not move anything; an unknown login is the same as before', async () => {
    const store = memory();
    await oldAccount(store);
    const d = deps(NEW, store);
    expect((await login(d, post({ login: 'ivan', password: 'wrong-password' }))).status).toBe(401);
    expect(store.data.has(`creds/${userIdFor(NEW, 'ivan')}.json`)).toBe(false);
    expect((await login(d, post({ login: 'nobody', password: 'password-one' }))).status).toBe(401);
  });

  it('old tokens (signed with the old secret) are refused', async () => {
    const store = memory();
    const { token } = await oldAccount(store);
    const d = deps(NEW, store, { restoreUntil: T0 + 1000 });
    const res = await getSync(
      d,
      new Request('http://x/api/sync', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(res.status).toBe(401);
  });

  it('the recovery code of the old account resets the password on the new host', async () => {
    const store = memory();
    const { recoveryCode } = await oldAccount(store);
    const d = deps(NEW, store);
    const res = await resetPassword(
      d,
      post({ login: 'ivan', recoveryCode, password: 'password-two' }),
    );
    expect(res.status).toBe(200);
    expect((await login(d, post({ login: 'ivan', password: 'password-two' }))).status).toBe(200);
  });

  it('the login of a moved account cannot be registered again by someone else', async () => {
    const store = memory();
    await oldAccount(store);
    const d = deps(NEW, store);
    const res = await register(d, post({ login: 'ivan', password: 'stranger-pass1' }));
    expect(res.status).toBe(409);
  });

  it('an account that was only restored (no password) can be registered fresh, taking nothing', async () => {
    const store = memory();
    // an account restored from a signed token on the old host: no password
    const old = deps(OLD, store, { restoreUntil: T0 + 1000 });
    const t = createSession(OLD, userIdFor(OLD, 'defeni'), T0 - 1000);
    await getSync(
      old,
      new Request('http://x/api/sync', {
        headers: { authorization: `Bearer ${t}`, 'x-account-login': 'defeni' },
      }),
    );
    await putSync(
      old,
      new Request('http://x/api/sync', {
        method: 'PUT',
        headers: { authorization: `Bearer ${t}` },
        body: snapshot,
      }),
    );
    const d = deps(NEW, store);
    // nobody can sign in to it...
    expect((await login(d, post({ login: 'defeni', password: 'anything-here' }))).status).toBe(401);
    // ...but the person can register the login anew; the old cloud copy is not handed over
    const reg = await register(d, post({ login: 'defeni', password: 'fresh-password' }));
    expect(reg.status).toBe(200);
    const { token } = (await reg.json()) as { token: string };
    const sync = await getSync(
      d,
      new Request('http://x/api/sync', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(await sync.json()).toEqual({ empty: true });
  });

  it('with the same secret nothing changes (no second account is made)', async () => {
    const store = memory();
    await oldAccount(store);
    const d = deps(OLD, store);
    expect((await login(d, post({ login: 'ivan', password: 'password-one' }))).status).toBe(200);
    expect([...store.data.keys()].filter((k) => k.startsWith('creds/'))).toHaveLength(1);
  });

  it('after the move the old record is gone, so the administrator sees the person once', async () => {
    const store = memory();
    await oldAccount(store);
    const admin = await oldAccount(store, 'blackjack');
    const d = deps(NEW, store, { adminLogins: ['blackjack'] });
    const list = async (token: string) =>
      (await (
        await adminUsers(
          d,
          new Request('http://x/api/admin', { headers: { authorization: `Bearer ${token}` } }),
        )
      ).json()) as { users: { login: string; legacy: boolean }[]; pending: string[] };
    // the administrator signs in first: moved, and sees the other one as "not signed in yet"
    const adminLogin = await login(d, post({ login: 'blackjack', password: 'password-one' }));
    const token = ((await adminLogin.json()) as { token: string }).token;
    let seen = await list(token);
    expect(seen.users.map((u) => [u.login, u.legacy]).sort()).toEqual([
      ['blackjack', false],
      ['ivan', true],
    ]);
    // then the other signs in: one entry each, nobody is "legacy", old keys are removed
    await login(d, post({ login: 'ivan', password: 'password-one' }));
    seen = await list(token);
    expect(seen.users.map((u) => [u.login, u.legacy]).sort()).toEqual([
      ['blackjack', false],
      ['ivan', false],
    ]);
    const oldId = userIdFor(OLD, 'ivan');
    expect([...store.data.keys()].some((k) => k.includes(oldId))).toBe(false);
    expect(admin.token).toBeTruthy();
  });

  it('a leftover old record next to the moved account is not listed twice', async () => {
    const store = memory();
    await oldAccount(store, 'blackjack');
    const d = deps(NEW, store, { adminLogins: ['blackjack'] });
    const res = await login(d, post({ login: 'blackjack', password: 'password-one' }));
    const token = ((await res.json()) as { token: string }).token;
    // simulate the old record coming back (e.g. a move made before the old record was removed)
    const oldId = userIdFor(OLD, 'blackjack');
    await store.put(`creds/${oldId}.json`, '{"salt":"00","hash":"00"}');
    await store.put(`meta/${oldId}.json`, JSON.stringify({ login: 'blackjack', createdAt: 1 }));
    const list = (await (
      await adminUsers(
        d,
        new Request('http://x/api/admin', { headers: { authorization: `Bearer ${token}` } }),
      )
    ).json()) as { users: { login: string }[] };
    expect(list.users.map((u) => u.login)).toEqual(['blackjack']);
  });
});

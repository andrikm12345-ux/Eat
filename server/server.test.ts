import { describe, expect, it, vi } from 'vitest';
import {
  createSession,
  isValidLogin,
  isValidPassword,
  LOCK_MS,
  MAX_FAILS,
  normalizeLogin,
  SESSION_TTL_MS,
  userIdFor,
  verifySession,
} from './auth.js';
import { getSync, login, putSync, register } from './handlers.js';
import type { Deps, Store } from './types.js';

const SECRET = 'x'.repeat(40);
const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
}

function deps(over: Partial<Deps> = {}) {
  let t = T0;
  const d: Deps = {
    secret: SECRET,
    store: memoryStore(),
    now: () => t,
    signupOpen: true,
    ...over,
  };
  return { d, advance: (ms: number) => (t += ms) };
}

const post = (body: unknown) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const creds = (l: string, p: string) => post({ login: l, password: p });

describe('auth primitives', () => {
  it('validates logins and passwords', () => {
    expect(normalizeLogin('  Ivan_01 ')).toBe('ivan_01');
    for (const ok of ['abc', 'a.b-c_9', 'x'.repeat(32)]) expect(isValidLogin(ok)).toBe(true);
    for (const bad of ['', 'ab', 'x'.repeat(33), 'иван', 'a b c', 'a@b.ru', 'A!B']) {
      expect(isValidLogin(bad)).toBe(false);
    }
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('x'.repeat(201))).toBe(false);
  });

  it('sessions: valid until expiry, bound to the secret, tamper-proof', () => {
    const uid = userIdFor(SECRET, 'ivan');
    expect(uid).toBe(userIdFor(SECRET, ' IVAN '));
    expect(uid).not.toBe(userIdFor(SECRET, 'petr'));
    const t = createSession(SECRET, uid, T0);
    expect(verifySession(SECRET, t, T0 + 1000)).toBe(uid);
    expect(verifySession(SECRET, t, T0 + SESSION_TTL_MS + 1)).toBeNull();
    expect(verifySession('z'.repeat(40), t, T0)).toBeNull();
    for (const junk of ['', 'x', 'a.b', '%%%.%%%'])
      expect(verifySession(SECRET, junk, T0)).toBeNull();
    const [p, sig] = t.split('.');
    const forged = Buffer.from(
      Buffer.from(p!, 'base64url').toString().replace(uid, 'other'),
    ).toString('base64url');
    expect(verifySession(SECRET, `${forged}.${sig}`, T0)).toBeNull();
  });
});

describe('register and login', () => {
  it('full flow: register → data → login on another browser sees the same data', async () => {
    const { d } = deps();
    const reg = await register(d, creds(' Ivan ', 'correct horse'));
    expect(reg.status).toBe(200);
    const { token, login: name } = (await reg.json()) as { token: string; login: string };
    expect(name).toBe('ivan');
    const auth = { authorization: `Bearer ${token}` };

    expect(await (await getSync(d, new Request('http://x', { headers: auth }))).json()).toEqual({
      empty: true,
    });
    const snapshot = JSON.stringify({
      format: 'dnevnik-backup',
      schemaVersion: 1,
      tables: { weights: [] },
    });
    expect(
      (await putSync(d, new Request('http://x', { method: 'PUT', headers: auth, body: snapshot })))
        .status,
    ).toBe(200);

    const again = await login(d, creds('IVAN', 'correct horse'));
    expect(again.status).toBe(200);
    const t2 = ((await again.json()) as { token: string }).token;
    const got = await getSync(
      d,
      new Request('http://x', { headers: { authorization: `Bearer ${t2}` } }),
    );
    expect(await got.text()).toBe(snapshot);

    const store = d.store as ReturnType<typeof memoryStore>;
    const stored = [...store.data.entries()];
    expect(stored.map(([k]) => k).sort()).toEqual([
      expect.stringMatching(/^creds\/[0-9a-f]{40}\.json$/),
      expect.stringMatching(/^users\/[0-9a-f]{40}\.json$/),
    ]);
    // The password itself is never stored.
    expect(JSON.stringify(stored)).not.toContain('correct horse');
  });

  it('accounts are isolated from each other', async () => {
    const { d } = deps();
    const a = (await (await register(d, creds('alice', 'password-a'))).json()) as { token: string };
    const b = (await (await register(d, creds('bobby', 'password-b'))).json()) as { token: string };
    const put = (token: string, body: string) =>
      putSync(
        d,
        new Request('http://x', {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}` },
          body,
        }),
      );
    await put(a.token, JSON.stringify({ format: 'dnevnik-backup', tables: { a: [1] } }));
    const read = await getSync(
      d,
      new Request('http://x', { headers: { authorization: `Bearer ${b.token}` } }),
    );
    expect(await read.json()).toEqual({ empty: true });
  });

  it('rejects duplicates, bad input and closed signup', async () => {
    const { d } = deps();
    expect((await register(d, creds('ivan', 'password1'))).status).toBe(200);
    expect(await (await register(d, creds('IVAN', 'other-pass1'))).json()).toEqual({
      error: 'taken',
    });
    expect(await (await register(d, creds('a', 'password1'))).json()).toEqual({
      error: 'bad_login',
    });
    expect(await (await register(d, creds('ivan2', 'short'))).json()).toEqual({
      error: 'bad_password',
    });
    expect(
      (await register(d, new Request('http://x', { method: 'POST', body: 'nope' }))).status,
    ).toBe(400);
    const closed = deps({ signupOpen: false });
    expect(await (await register(closed.d, creds('ivan', 'password1'))).json()).toEqual({
      error: 'signup_closed',
    });
  });

  it('wrong password and unknown login look the same', async () => {
    const delay = vi.fn(() => 1);
    const { d } = deps({ failDelayMs: delay });
    await register(d, creds('ivan', 'password1'));
    const wrong = await login(d, creds('ivan', 'password2'));
    const unknown = await login(d, creds('nobody', 'password2'));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'wrong_credentials' });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: 'wrong_credentials' });
    expect(delay).toHaveBeenCalledTimes(2);
    expect((await login(d, creds('x', 'password2'))).status).toBe(400);
  });

  it('locks after repeated failures, then unlocks; success resets the counter', async () => {
    const { d, advance } = deps();
    await register(d, creds('ivan', 'password1'));
    for (let i = 0; i < MAX_FAILS - 1; i++) await login(d, creds('ivan', 'bad-password'));
    // A success in between clears the counter.
    expect((await login(d, creds('ivan', 'password1'))).status).toBe(200);
    for (let i = 0; i < MAX_FAILS; i++) await login(d, creds('ivan', 'bad-password'));
    const locked = await login(d, creds('ivan', 'password1'));
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ error: 'locked', retryAfterSec: LOCK_MS / 1000 });
    advance(LOCK_MS + 1);
    expect((await login(d, creds('ivan', 'password1'))).status).toBe(200);
  });

  it('sync needs a valid session and validates what is stored', async () => {
    const { d } = deps();
    expect((await getSync(d, new Request('http://x'))).status).toBe(401);
    expect(
      (
        await putSync(
          d,
          new Request('http://x', {
            method: 'PUT',
            headers: { authorization: 'Bearer bad.token' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
    const { token } = (await (await register(d, creds('ivan', 'password1'))).json()) as {
      token: string;
    };
    const put = (body: string) =>
      putSync(
        d,
        new Request('http://x', {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}` },
          body,
        }),
      );
    expect((await put('not json')).status).toBe(400);
    expect((await put('{"format":"other","tables":{}}')).status).toBe(400);
    expect((await put('x'.repeat(4 * 1024 * 1024 + 1))).status).toBe(413);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createSession,
  isValidLogin,
  generateRecoveryCode,
  isValidPassword,
  LOCK_MS,
  MAX_FAILS,
  normalizeLogin,
  normalizeRecovery,
  SESSION_TTL_MS,
  userIdFor,
  verifySession,
} from './auth.js';
import {
  adminReset,
  getSync,
  login,
  newRecovery,
  putSync,
  register,
  resetPassword,
} from './handlers.js';
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

describe('password recovery', () => {
  const reset = (l: string, code: string, pw: string) =>
    post({ login: l, recoveryCode: code, password: pw });

  it('recovery codes: format and normalization', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([2-9A-HJ-NP-Z]{5}-){3}[2-9A-HJ-NP-Z]{5}$/);
    expect(generateRecoveryCode()).not.toBe(code);
    expect(normalizeRecovery(` ${code.toLowerCase().replaceAll('-', ' ')} `)).toBe(
      code.replaceAll('-', ''),
    );
  });

  it('register returns a code; it sets a new password once and rotates', async () => {
    const { d } = deps();
    const reg = (await (await register(d, creds('ivan', 'old-password'))).json()) as {
      recoveryCode: string;
    };
    expect(reg.recoveryCode).toMatch(/^\w{5}(-\w{5}){3}$/);

    // Lower case and no dashes still work.
    const typed = reg.recoveryCode.toLowerCase().replaceAll('-', '');
    const res = await resetPassword(d, reset('IVAN', typed, 'new-password'));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { token: string; recoveryCode: string };
    expect(out.recoveryCode).not.toBe(reg.recoveryCode);

    expect((await login(d, creds('ivan', 'old-password'))).status).toBe(401);
    expect((await login(d, creds('ivan', 'new-password'))).status).toBe(200);
    // The used code is dead, the fresh one works.
    expect((await resetPassword(d, reset('ivan', reg.recoveryCode, 'third-password'))).status).toBe(
      401,
    );
    expect((await resetPassword(d, reset('ivan', out.recoveryCode, 'third-password'))).status).toBe(
      200,
    );
    expect(JSON.stringify([...(d.store as ReturnType<typeof memoryStore>).data])).not.toContain(
      out.recoveryCode,
    );
  });

  it('data stays after a reset', async () => {
    const { d } = deps();
    const reg = (await (await register(d, creds('ivan', 'old-password'))).json()) as {
      token: string;
      recoveryCode: string;
    };
    const snapshot = JSON.stringify({ format: 'dnevnik-backup', tables: { w: [1] } });
    await putSync(
      d,
      new Request('http://x', {
        method: 'PUT',
        headers: { authorization: `Bearer ${reg.token}` },
        body: snapshot,
      }),
    );
    const out = (await (
      await resetPassword(d, reset('ivan', reg.recoveryCode, 'new-password'))
    ).json()) as { token: string };
    const got = await getSync(
      d,
      new Request('http://x', { headers: { authorization: `Bearer ${out.token}` } }),
    );
    expect(await got.text()).toBe(snapshot);
  });

  it('wrong code, unknown login, bad input, lockout and accounts without a code', async () => {
    const { d, advance } = deps();
    const reg = (await (await register(d, creds('ivan', 'old-password'))).json()) as {
      recoveryCode: string;
    };
    expect(
      (await resetPassword(d, reset('ivan', 'AAAAA-AAAAA-AAAAA-AAAAA', 'new-password'))).status,
    ).toBe(401);
    expect((await resetPassword(d, reset('nobody', reg.recoveryCode, 'new-password'))).status).toBe(
      401,
    );
    expect((await resetPassword(d, reset('ivan', reg.recoveryCode, 'short'))).status).toBe(400);
    expect((await resetPassword(d, reset('x', reg.recoveryCode, 'new-password'))).status).toBe(400);
    for (let i = 0; i < MAX_FAILS; i++)
      await resetPassword(d, reset('ivan', 'WRONG', 'new-password'));
    expect((await resetPassword(d, reset('ivan', reg.recoveryCode, 'new-password'))).status).toBe(
      429,
    );
    advance(LOCK_MS + 1);
    expect((await resetPassword(d, reset('ivan', reg.recoveryCode, 'new-password'))).status).toBe(
      200,
    );

    // An account created before recovery existed has no code.
    const store = d.store as ReturnType<typeof memoryStore>;
    const key = [...store.data.keys()].find((k) => k.startsWith('creds/'))!;
    const { recovery: _drop, ...legacy } = JSON.parse(store.data.get(key)!);
    store.data.set(key, JSON.stringify(legacy));
    expect((await resetPassword(d, reset('ivan', reg.recoveryCode, 'x-password-1'))).status).toBe(
      401,
    );
  });

  it('works while signup is closed', async () => {
    const open = deps();
    const reg = (await (await register(open.d, creds('ivan', 'old-password'))).json()) as {
      recoveryCode: string;
    };
    const closed = { ...open.d, signupOpen: false };
    expect(
      (await resetPassword(closed, reset('ivan', reg.recoveryCode, 'new-password'))).status,
    ).toBe(200);
  });
});

describe('recovery code for existing accounts', () => {
  it('a signed-in user can issue a code after confirming the password', async () => {
    const { d, advance } = deps();
    const { token } = (await (await register(d, creds('ivan', 'old-password'))).json()) as {
      token: string;
    };
    // Simulate an account made before codes existed.
    const store = d.store as ReturnType<typeof memoryStore>;
    const key = [...store.data.keys()].find((k) => k.startsWith('creds/'))!;
    const { recovery: _drop, ...legacy } = JSON.parse(store.data.get(key)!);
    store.data.set(key, JSON.stringify(legacy));

    const ask = (tok: string | null, pw: string) =>
      newRecovery(
        d,
        new Request('http://x', {
          method: 'POST',
          headers: tok ? { authorization: `Bearer ${tok}` } : {},
          body: JSON.stringify({ password: pw }),
        }),
      );
    expect((await ask(null, 'old-password')).status).toBe(401);
    expect((await ask('bad.token', 'old-password')).status).toBe(401);
    expect((await ask(token, 'wrong-password')).status).toBe(401);
    const ok = await ask(token, 'old-password');
    expect(ok.status).toBe(200);
    const { recoveryCode } = (await ok.json()) as { recoveryCode: string };
    expect(
      (await resetPassword(d, post({ login: 'ivan', recoveryCode, password: 'new-password' })))
        .status,
    ).toBe(200);

    // Wrong passwords lock it like login does.
    for (let i = 0; i < MAX_FAILS; i++) await ask(token, 'wrong-password');
    expect((await ask(token, 'new-password')).status).toBe(429);
    advance(LOCK_MS + 1);
    expect((await ask(token, 'new-password')).status).toBe(200);
    // A session whose account record is gone is rejected.
    store.data.delete(key);
    expect((await ask(token, 'new-password')).status).toBe(401);
  });
});

describe('admin reset', () => {
  const call = (d: Deps, body: unknown) => adminReset(d, post(body));
  it('is off without a key, needs the key, and keeps data and recovery code', async () => {
    const { d } = deps();
    const reg = (await (await register(d, creds('ivan', 'old-password'))).json()) as {
      recoveryCode: string;
    };
    const off = { login: 'ivan', password: 'temp-password', adminKey: 'k' };
    expect((await call(d, off)).status).toBe(404);
    const on = { ...d, adminKey: 'secret-key' };
    expect((await call(on, { ...off, adminKey: 'wrong' })).status).toBe(404);
    expect((await call(on, { ...off, adminKey: 'secret-key', login: 'ghost' })).status).toBe(404);
    expect((await call(on, { ...off, adminKey: 'secret-key', password: 'short' })).status).toBe(
      400,
    );
    expect((await call(on, { ...off, adminKey: 'secret-key' })).status).toBe(200);
    expect((await login(d, creds('ivan', 'old-password'))).status).toBe(401);
    expect((await login(d, creds('ivan', 'temp-password'))).status).toBe(200);
    expect(
      (
        await resetPassword(
          d,
          post({ login: 'ivan', recoveryCode: reg.recoveryCode, password: 'again-password' }),
        )
      ).status,
    ).toBe(200);
  });
});

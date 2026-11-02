import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSync,
  login as srvLogin,
  putSync,
  register as srvRegister,
  changePassword as srvPassword,
  newRecovery as srvRecovery,
  resetPassword as srvReset,
} from '../../server/handlers';
import type { Deps } from '../../server/types';
import { repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';
import { seedOnboarded } from '../test/seed';
import {
  ACCOUNT,
  changeAccountPassword,
  createRecoveryCode,
  getSession,
  loginAccount,
  registerAccount,
  resetAccount,
  signOut,
} from './account';
import { exportJson } from './backup';
import { buildSnapshot, startAccountSync, syncNow } from './sync';

const files = new Map<string, string>();
let signupOpen = true;
const deps = (): Deps => ({
  secret: 's'.repeat(40),
  store: { get: async (p) => files.get(p) ?? null, put: async (p, b) => void files.set(p, b) },
  now: () => Date.now(),
  signupOpen,
});

let offline = false;
beforeEach(() => {
  files.clear();
  offline = false;
  signupOpen = true;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline');
    const req = new Request(`http://localhost${url}`, init);
    if (url === '/api/auth/register') return srvRegister(deps(), req);
    if (url === '/api/auth/login') return srvLogin(deps(), req);
    if (url === '/api/auth/reset') return srvReset(deps(), req);
    if (url === '/api/auth/recovery') return srvRecovery(deps(), req);
    if (url === '/api/auth/password') return srvPassword(deps(), req);
    return req.method === 'PUT' ? putSync(deps(), req) : getSync(deps(), req);
  });
});
afterEach(() => vi.unstubAllGlobals());

const PW = 'password-1';
/** Registers (first time) or signs in. */
async function signIn(name = 'ivan') {
  const r = await loginAccount(repos, name, PW);
  if ('error' in r) {
    const reg = await registerAccount(repos, name, PW);
    if ('error' in reg) throw new Error(reg.error);
  }
}

describe('account', () => {
  it('registers, signs out and signs in again', async () => {
    expect(await registerAccount(repos, ' Ivan ', PW)).toMatchObject({ login: 'ivan' });
    expect(await getSession(repos)).toMatchObject({ login: 'ivan' });
    await signOut(repos);
    expect(await getSession(repos)).toBeNull();
    expect(await loginAccount(repos, 'IVAN', PW)).toEqual({ login: 'ivan' });
  });

  it('reports errors', async () => {
    expect(await registerAccount(repos, 'a', PW)).toEqual({ error: 'bad_login' });
    expect(await registerAccount(repos, 'ivan', 'short')).toEqual({ error: 'bad_password' });
    await registerAccount(repos, 'ivan', PW);
    expect(await registerAccount(repos, 'ivan', PW)).toEqual({ error: 'taken' });
    expect(await loginAccount(repos, 'ivan', 'wrong-password')).toEqual({
      error: 'wrong_credentials',
    });
    signupOpen = false;
    expect(await registerAccount(repos, 'petr', PW)).toEqual({ error: 'signup_closed' });
    vi.stubGlobal('fetch', async () => new Response('oops', { status: 500 }));
    expect(await loginAccount(repos, 'ivan', PW)).toEqual({ error: 'unknown' });
    offline = true;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await loginAccount(repos, 'ivan', PW)).toEqual({ error: 'network' });
  });
});

describe('sync', () => {
  it('needs a session', async () => {
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'signed_out' });
  });

  it('data survives a fresh browser; secrets and caches stay home', async () => {
    await repos.profile.save({
      sex: 'male',
      birthDate: '1990-01-01',
      heightCm: 180,
      activityLevel: 'light',
      exerciseCaloriesMode: 'none',
      weekStartsOn: 1,
      units: 'metric',
    });
    await repos.weights.create({ date: '2026-10-30', time: '07:00', kg: 82.5, source: 'manual' });
    await repos.settings.set('aiApiKey', 'sk-secret');
    await signIn();
    const first = await syncNow(repos);
    expect(first).toMatchObject({ ok: true, pushed: true });
    const stored = [...files.values()].join('');
    expect(stored).toContain('82.5');
    expect(stored).not.toContain('sk-secret');
    expect(stored).not.toContain(ACCOUNT.token);
    expect(await syncNow(repos)).toMatchObject({ ok: true, pushed: false });

    // "New browser": empty database, same account.
    for (const t of repos.db.tables) await t.clear();
    expect(await repos.weights.list()).toHaveLength(0);
    await signIn();
    const second = await syncNow(repos);
    expect(second).toMatchObject({ ok: true, pulled: expect.any(Number) });
    expect((await repos.weights.list()).map((w) => w.kg)).toEqual([82.5]);
    expect(await repos.profile.get()).toMatchObject({ heightCm: 180 });
  });

  it('merges edits from two devices by updatedAt', async () => {
    await signIn();
    const w = await repos.weights.create({
      date: '2026-10-30',
      time: '07:00',
      kg: 80,
      source: 'manual',
    });
    await syncNow(repos);
    const key = [...files.keys()].find((k) => k.startsWith('users/'))!;
    const remote = JSON.parse(files.get(key)!);
    remote.tables.weights[0].kg = 79;
    remote.tables.weights[0].updatedAt = '2999-01-01T00:00:00.000Z';
    remote.tables.weights.push({
      ...remote.tables.weights[0],
      id: 'other',
      kg: 70,
      updatedAt: '2999-01-01T00:00:00.000Z',
    });
    files.set(key, JSON.stringify(remote));
    const r = await syncNow(repos);
    expect(r).toMatchObject({ ok: true });
    expect((await repos.db.weights.get(w.id))?.kg).toBe(79);
    expect(await repos.db.weights.count()).toBe(2);
  });

  it('handles offline, expired sessions and server errors', async () => {
    await signIn();
    offline = true;
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'network' });
    offline = false;
    await repos.settings.set(ACCOUNT.token, 'bad.token');
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'expired' });
    expect(await getSession(repos)).toBeNull();

    await signIn();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'server' });
    const token = (await getSession(repos))!.token;
    let n = 0;
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('{}', { status: [413, 401, 500][n++] });
      return new Response('{"empty":true}');
    });
    await repos.weights.create({ date: '2026-10-30', time: '07:00', kg: 80, source: 'manual' });
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'too_big' });
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'expired' });
    await repos.settings.set(ACCOUNT.token, token);
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'server' });
  });

  it('snapshot leaves out local-only tables, base foods and AI settings', async () => {
    await repos.settings.set('aiEnabled', true);
    await repos.settings.set('baseFoodsVersion', 3);
    await repos.settings.set('trendAlpha', 0.2);
    await repos.db.foods.bulkPut([
      { id: 'b0', name: 'Base', source: 'base', useCount: 0 },
      { id: 'b1', name: 'Used base', source: 'base', useCount: 2 },
      { id: 'u1', name: 'Mine', source: 'user', useCount: 0 },
    ] as never);
    const snap = await buildSnapshot(repos);
    expect(Object.keys(snap.tables)).not.toContain('tdeeHistory');
    expect(Object.keys(snap.tables)).not.toContain('blobs');
    expect((snap.tables.foods as { id: string }[]).map((f) => f.id).sort()).toEqual(['b1', 'u1']);
    expect((snap.tables.settings as { key: string }[]).map((s) => s.key)).toEqual(['trendAlpha']);
    expect((await exportJson(repos, { includePhotos: false })).tables.settings).toBeDefined();
  });

  it('auto-sync pushes a change shortly after it is made', async () => {
    await signIn();
    const stop = startAccountSync(repos, 20);
    await repos.weights.create({ date: '2026-10-30', time: '07:00', kg: 77.7, source: 'manual' });
    await waitFor(() => expect([...files.values()].join('')).toContain('77.7'), { timeout: 3000 });
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    stop();
  });
});

describe('recovery', () => {
  it('a recovery code resets the password and rotates', async () => {
    const reg = await registerAccount(repos, 'ivan', PW);
    const code = (reg as { recoveryCode: string }).recoveryCode;
    expect(code).toMatch(/^\w{5}(-\w{5}){3}$/);
    await signOut(repos);
    expect(await resetAccount(repos, 'ivan', 'WRONG', 'new-password')).toEqual({
      error: 'wrong_credentials',
    });
    const out = await resetAccount(repos, 'ivan', code, 'new-password');
    expect(out).toMatchObject({ login: 'ivan', recoveryCode: expect.any(String) });
    expect((out as { recoveryCode: string }).recoveryCode).not.toBe(code);
    expect(await loginAccount(repos, 'ivan', PW)).toEqual({ error: 'wrong_credentials' });
    expect(await loginAccount(repos, 'ivan', 'new-password')).toEqual({ login: 'ivan' });
  });
});

describe('recovery code for the signed-in account', () => {
  it('needs the password; the new code works', async () => {
    await registerAccount(repos, 'ivan', PW);
    expect(await createRecoveryCode(repos, 'wrong-password')).toEqual({
      error: 'wrong_credentials',
    });
    const r = (await createRecoveryCode(repos, PW)) as { recoveryCode: string };
    expect(r.recoveryCode).toMatch(/^\w{5}(-\w{5}){3}$/);
    expect(await resetAccount(repos, 'ivan', r.recoveryCode, 'new-password')).toMatchObject({
      login: 'ivan',
    });
    await signOut(repos);
    expect(await createRecoveryCode(repos, PW)).toEqual({ error: 'wrong_credentials' });
  });

  it('reports server and network errors', async () => {
    await registerAccount(repos, 'ivan', PW);
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    expect(await createRecoveryCode(repos, PW)).toEqual({ error: 'unknown' });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await createRecoveryCode(repos, PW)).toEqual({ error: 'network' });
  });

  it('account page: button shows a new code', async () => {
    await registerAccount(repos, 'ivan', PW);
    const user = userEvent.setup();
    await renderApp('/account');
    await user.type(await screen.findByLabelText(ru.account.password), 'wrong-password');
    await user.click(screen.getByRole('button', { name: ru.account.newCodeGo }));
    expect(await screen.findByText(ru.account.errors.wrong_credentials)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.password));
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.click(screen.getByRole('button', { name: ru.account.newCodeGo }));
    expect(await screen.findByText(ru.account.saveCodeTitle)).toBeVisible();
  });
});

describe('change password', () => {
  it('service: needs the current password', async () => {
    await registerAccount(repos, 'ivan', PW);
    expect(await changeAccountPassword(repos, 'wrong-password', 'new-password')).toEqual({
      error: 'wrong_credentials',
    });
    expect(await changeAccountPassword(repos, PW, 'short')).toEqual({ error: 'bad_password' });
    const before = await getSession(repos);
    expect(await changeAccountPassword(repos, PW, 'new-password')).toEqual({ ok: true });
    // The server issued a new token for this device: it is stored in place of the old one.
    expect((await getSession(repos))?.token).not.toBe(before?.token);
    expect(await loginAccount(repos, 'ivan', PW)).toEqual({ error: 'wrong_credentials' });
    expect(await loginAccount(repos, 'ivan', 'new-password')).toMatchObject({ login: 'ivan' });
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    expect(await changeAccountPassword(repos, PW, 'other-password')).toEqual({ error: 'unknown' });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await changeAccountPassword(repos, PW, 'other-password')).toEqual({ error: 'network' });
    await signOut(repos);
    expect(await changeAccountPassword(repos, PW, 'x-password-1')).toEqual({
      error: 'wrong_credentials',
    });
  });

  it('account page: change the password', async () => {
    await registerAccount(repos, 'ivan', PW);
    const user = userEvent.setup();
    await renderApp('/account');
    await user.type(await screen.findByLabelText(ru.account.currentPassword), PW);
    await user.type(screen.getByLabelText(ru.account.newPassword), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: ru.account.changeGo }));
    expect(await screen.findByText(ru.account.changed)).toBeVisible();
    expect(await loginAccount(repos, 'ivan', 'brand-new-pass')).toMatchObject({ login: 'ivan' });
    await user.type(screen.getByLabelText(ru.account.currentPassword), 'wrong-password');
    await user.type(screen.getByLabelText(ru.account.newPassword), 'another-pass-1');
    await user.click(screen.getByRole('button', { name: ru.account.changeGo }));
    expect(await screen.findByText(ru.account.errors.wrong_credentials)).toBeVisible();
  });
});

describe('storage screen', () => {
  it('tells that the cloud copy is on for the signed-in account', async () => {
    await registerAccount(repos, 'ivan', PW);
    await renderApp('/more/storage');
    expect(await screen.findByText(ru.storage.cloudOn('ivan'))).toBeVisible();
  });
});

describe('account page', () => {
  it('create an account: password mismatch, taken login, then success', async () => {
    await registerAccount(repos, 'busy', PW);
    await signOut(repos);
    const user = userEvent.setup();
    await renderApp('/account', { seed: false, signedOut: true });
    await user.click(await screen.findByRole('radio', { name: ru.account.tabs.signUp }));
    await user.type(screen.getByLabelText(ru.account.login), 'busy');
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.type(screen.getByLabelText(ru.account.password2), 'different-1');
    await user.click(screen.getByRole('button', { name: ru.account.signUp }));
    expect(await screen.findByText(ru.account.errors.mismatch)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.password2));
    await user.type(screen.getByLabelText(ru.account.password2), PW);
    await user.click(screen.getByRole('button', { name: ru.account.signUp }));
    expect(await screen.findByText(ru.account.errors.taken)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.login));
    await user.type(screen.getByLabelText(ru.account.login), 'fresh');
    await user.click(screen.getByRole('button', { name: ru.account.signUp }));
    expect(await screen.findByText(ru.account.saveCodeTitle)).toBeVisible();
    await waitFor(async () => expect(await getSession(repos)).toMatchObject({ login: 'fresh' }));
    await user.click(screen.getByRole('button', { name: ru.account.copy }));
    expect(await screen.findByText(ru.account.copied)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.saved }));
    await waitFor(() => expect(screen.queryByText(ru.account.saveCodeTitle)).toBeNull());
  });

  it('a new account on a browser that holds data starts clean, with the wizard', async () => {
    await seedOnboarded();
    expect(await repos.profile.get()).toBeTruthy();
    const user = userEvent.setup();
    const { router } = await renderApp('/account', { seed: false, signedOut: true });
    await user.click(await screen.findByRole('radio', { name: ru.account.tabs.signUp }));
    await user.type(screen.getByLabelText(ru.account.login), 'newbie');
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.type(screen.getByLabelText(ru.account.password2), PW);
    await user.click(screen.getByRole('button', { name: ru.account.signUp }));
    expect(await screen.findByText(ru.account.saveCodeTitle)).toBeVisible();
    expect(await repos.profile.get()).toBeFalsy();
    expect(await repos.db.goals.count()).toBe(0);
    expect(await getSession(repos)).toMatchObject({ login: 'newbie' });
    await user.click(screen.getByRole('button', { name: ru.account.saved }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/wizard'));
  });

  it('sign in: wrong password, then right one', async () => {
    await registerAccount(repos, 'ivan', PW);
    await signOut(repos);
    const user = userEvent.setup();
    await renderApp('/account', { seed: false, signedOut: true });
    await user.type(await screen.findByLabelText(ru.account.login), 'ivan');
    await user.type(screen.getByLabelText(ru.account.password), 'wrong-password');
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    expect(await screen.findByText(ru.account.errors.wrong_credentials)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.password));
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    await waitFor(async () => expect(await getSession(repos)).toMatchObject({ login: 'ivan' }));
  });

  it('forgot password: recovery code → new password → new code', async () => {
    const reg = (await registerAccount(repos, 'ivan', PW)) as { recoveryCode: string };
    await signOut(repos);
    const user = userEvent.setup();
    await renderApp('/account', { seed: false, signedOut: true });
    await user.click(await screen.findByRole('button', { name: ru.account.forgot }));
    await user.type(screen.getByLabelText(ru.account.login), 'ivan');
    await user.type(screen.getByLabelText(ru.account.recoveryCode), reg.recoveryCode);
    await user.type(screen.getByLabelText(ru.account.newPassword), 'brand-new-pass');
    await user.click(screen.getByRole('switch', { name: ru.account.showPassword }));
    expect(screen.getByLabelText(ru.account.newPassword)).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: ru.account.resetGo }));
    expect(await screen.findByText(ru.account.saveCodeTitle)).toBeVisible();
    expect(await loginAccount(repos, 'ivan', 'brand-new-pass')).toEqual({ login: 'ivan' });
  });

  it('can go back from the reset form', async () => {
    const user = userEvent.setup();
    await renderApp('/account', { seed: false, signedOut: true });
    await user.click(await screen.findByRole('button', { name: ru.account.forgot }));
    expect(await screen.findByLabelText(ru.account.recoveryCode)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.backToSignIn }));
    expect(await screen.findByRole('button', { name: ru.account.forgot })).toBeVisible();
  });

  it('signed-in view: sync now and sign out', async () => {
    await signIn();
    const user = userEvent.setup();
    await renderApp('/account');
    expect(await screen.findByText(ru.account.signedIn('ivan'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.syncNow }));
    expect(await screen.findByText(ru.account.synced)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.signOut }));
    expect(await screen.findByLabelText(ru.account.login)).toBeVisible();
  });
});

describe('entry points', () => {
  it('wizard and the menu link to the account page', async () => {
    await renderApp('/wizard', { seed: false });
    expect(await screen.findByRole('link', { name: ru.account.haveAccount })).toHaveAttribute(
      'href',
      '/account',
    );
  });
});

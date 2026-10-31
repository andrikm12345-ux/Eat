import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSync,
  login as srvLogin,
  putSync,
  register as srvRegister,
} from '../../server/handlers';
import type { Deps } from '../../server/types';
import { repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';
import { ACCOUNT, getSession, loginAccount, registerAccount, signOut } from './account';
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
    expect(await registerAccount(repos, ' Ivan ', PW)).toEqual({ login: 'ivan' });
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

  it('locks after repeated wrong passwords', async () => {
    await registerAccount(repos, 'ivan', PW);
    for (let i = 0; i < 5; i++) await loginAccount(repos, 'ivan', 'wrong-password');
    expect(await loginAccount(repos, 'ivan', PW)).toMatchObject({ error: 'locked' });
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

describe('account page', () => {
  it('create an account: password mismatch, taken login, then success', async () => {
    await registerAccount(repos, 'busy', PW);
    await signOut(repos);
    const user = userEvent.setup();
    await renderApp('/account', { seed: false });
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
    await waitFor(async () => expect(await getSession(repos)).toMatchObject({ login: 'fresh' }));
  });

  it('sign in: wrong password, then right one', async () => {
    await registerAccount(repos, 'ivan', PW);
    await signOut(repos);
    const user = userEvent.setup();
    await renderApp('/account', { seed: false });
    await user.type(await screen.findByLabelText(ru.account.login), 'ivan');
    await user.type(screen.getByLabelText(ru.account.password), 'wrong-password');
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    expect(await screen.findByText(ru.account.errors.wrong_credentials)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.password));
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    await waitFor(async () => expect(await getSession(repos)).toMatchObject({ login: 'ivan' }));
  });

  it('shows the lock message', async () => {
    await registerAccount(repos, 'ivan', PW);
    await signOut(repos);
    for (let i = 0; i < 5; i++) await loginAccount(repos, 'ivan', 'wrong-password');
    const user = userEvent.setup();
    await renderApp('/account', { seed: false });
    await user.type(await screen.findByLabelText(ru.account.login), 'ivan');
    await user.type(screen.getByLabelText(ru.account.password), PW);
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    expect(await screen.findByText(ru.account.errors.locked(15))).toBeVisible();
  });

  it('signed-in view: sync now and sign out', async () => {
    await signIn();
    const user = userEvent.setup();
    await renderApp('/account');
    expect(await screen.findByText(ru.account.signedIn('ivan'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.syncNow }));
    expect(await screen.findByText(/Последняя синхронизация/)).toBeVisible();
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

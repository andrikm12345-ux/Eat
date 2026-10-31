import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSync,
  putSync,
  requestCode as srvRequest,
  verifyCode as srvVerify,
} from '../../server/handlers';
import type { Deps } from '../../server/types';
import { repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';
import { ACCOUNT, getSession, requestCode, signOut, verifyCode } from './account';
import { exportJson } from './backup';
import { buildSnapshot, startAccountSync, syncNow } from './sync';

const sent: string[] = [];
const files = new Map<string, string>();
const deps: Deps = {
  secret: 's'.repeat(40),
  store: { get: async (p) => files.get(p) ?? null, put: async (p, b) => void files.set(p, b) },
  mail: async (_to, code) => void sent.push(code),
  now: () => Date.now(),
  allowed: [],
  failDelayMs: () => 0,
};

let offline = false;
beforeEach(() => {
  sent.length = 0;
  files.clear();
  offline = false;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline');
    const req = new Request(`http://localhost${url}`, init);
    if (url === '/api/auth/request') return srvRequest(deps, req);
    if (url === '/api/auth/verify') return srvVerify(deps, req);
    return req.method === 'PUT' ? putSync(deps, req) : getSync(deps, req);
  });
});
afterEach(() => vi.unstubAllGlobals());

async function login(email = 'me@mail.ru') {
  const r = await requestCode(email);
  if ('error' in r) throw new Error(r.error);
  return verifyCode(repos, r.challenge, sent.at(-1)!);
}

describe('account', () => {
  it('signs in with the emailed code and signs out', async () => {
    expect(await login()).toEqual({ email: 'me@mail.ru' });
    expect(await getSession(repos)).toMatchObject({ email: 'me@mail.ru' });
    await signOut(repos);
    expect(await getSession(repos)).toBeNull();
  });

  it('reports errors', async () => {
    expect(await requestCode('nope')).toEqual({ error: 'invalid_email' });
    const r = (await requestCode('a@b.ru')) as { challenge: string };
    expect(await verifyCode(repos, r.challenge, '00000000')).toEqual({ error: 'bad_code' });
    offline = true;
    expect(await requestCode('a@b.ru')).toEqual({ error: 'network' });
    offline = false;
    deps.mail = async () => {
      throw new Error('x');
    };
    expect(await requestCode('a@b.ru')).toEqual({ error: 'mail' });
    deps.mail = async (_t, c) => void sent.push(c);
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
    await login();
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
    await login();
    const second = await syncNow(repos);
    expect(second).toMatchObject({ ok: true, pulled: expect.any(Number) });
    expect((await repos.weights.list()).map((w) => w.kg)).toEqual([82.5]);
    expect(await repos.profile.get()).toMatchObject({ heightCm: 180 });
  });

  it('merges edits from two devices by updatedAt', async () => {
    await login();
    const w = await repos.weights.create({
      date: '2026-10-30',
      time: '07:00',
      kg: 80,
      source: 'manual',
    });
    await syncNow(repos);
    const remote = JSON.parse([...files.values()][0]!);
    remote.tables.weights[0].kg = 79;
    remote.tables.weights[0].updatedAt = '2999-01-01T00:00:00.000Z';
    remote.tables.weights.push({
      ...remote.tables.weights[0],
      id: 'other',
      kg: 70,
      updatedAt: '2999-01-01T00:00:00.000Z',
    });
    files.set([...files.keys()][0]!, JSON.stringify(remote));
    const r = await syncNow(repos);
    expect(r).toMatchObject({ ok: true });
    expect((await repos.db.weights.get(w.id))?.kg).toBe(79);
    expect(await repos.db.weights.count()).toBe(2);
  });

  it('handles offline, expired sessions and server errors', async () => {
    await login();
    offline = true;
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'network' });
    offline = false;
    await repos.settings.set(ACCOUNT.token, 'bad.token');
    expect(await syncNow(repos)).toEqual({ ok: false, reason: 'expired' });
    expect(await getSession(repos)).toBeNull();

    await login();
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
    await login();
    const stop = startAccountSync(repos, 20);
    await repos.weights.create({ date: '2026-10-30', time: '07:00', kg: 77.7, source: 'manual' });
    await waitFor(() => expect([...files.values()].join('')).toContain('77.7'), { timeout: 3000 });
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    stop();
  });
});

describe('account page', () => {
  it('email → code → signed in', async () => {
    const user = userEvent.setup();
    await renderApp('/account', { seed: false });
    await user.type(await screen.findByLabelText(ru.account.email), 'me@mail.ru');
    await user.click(screen.getByRole('button', { name: ru.account.getCode }));
    await user.type(await screen.findByLabelText(ru.account.code), '00000000');
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    expect(await screen.findByText(ru.account.errors.bad_code)).toBeVisible();
    await user.clear(screen.getByLabelText(ru.account.code));
    await user.type(screen.getByLabelText(ru.account.code), sent.at(-1)!);
    await user.click(screen.getByRole('button', { name: ru.account.signIn }));
    await waitFor(async () =>
      expect(await getSession(repos)).toMatchObject({ email: 'me@mail.ru' }),
    );
  });

  it('signed-in view: sync now and sign out', async () => {
    await login();
    const user = userEvent.setup();
    await renderApp('/account');
    expect(await screen.findByText(ru.account.signedIn('me@mail.ru'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.syncNow }));
    expect(
      await screen.findByText(ru.account.lastSync(/.*/.source).slice(0, 20), { exact: false }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.account.signOut }));
    expect(await screen.findByLabelText(ru.account.email)).toBeVisible();
  });

  it('can switch email, resend, and shows errors', async () => {
    const user = userEvent.setup();
    await renderApp('/account', { seed: false });
    await user.type(await screen.findByLabelText(ru.account.email), 'me@mail.ru');
    await user.click(screen.getByRole('button', { name: ru.account.getCode }));
    await screen.findByLabelText(ru.account.code);
    await user.click(screen.getByRole('button', { name: ru.account.resend }));
    await waitFor(() => expect(sent).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: ru.account.otherEmail }));
    offline = true;
    await user.click(await screen.findByRole('button', { name: ru.account.getCode }));
    expect(await screen.findByText(ru.account.errors.network)).toBeVisible();
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

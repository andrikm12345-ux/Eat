import { createHash } from 'node:crypto';
import {
  checkSecret,
  createSession,
  generateRecoveryCode,
  hashSecret,
  isValidLogin,
  isValidPassword,
  normalizeLogin,
  normalizeRecovery,
  userIdFor,
  sessionInfo,
  type Credentials,
} from './auth.js';
import { bearer, json, readJson } from './http.js';
import type { Deps } from './types.js';

export const MAX_SYNC_BYTES = 4 * 1024 * 1024;

const credPath = (userId: string) => `creds/${userId}.json`;
const metaPath = (userId: string) => `meta/${userId}.json`;

/**
 * Remembers the readable login, the registration day and the last sign-in of an account (the
 * credentials store only hashes). Best effort: a failure here never blocks signing in.
 */
async function touchMeta(d: Deps, userId: string, login: string, created: boolean): Promise<void> {
  try {
    let createdAt = d.now();
    if (!created) {
      const old = await d.store.get(metaPath(userId));
      if (old) createdAt = (JSON.parse(old) as { createdAt?: number }).createdAt ?? createdAt;
    }
    await d.store.put(metaPath(userId), JSON.stringify({ login, createdAt, lastLogin: d.now() }));
  } catch (e) {
    console.error('meta update failed', e);
  }
}

export async function readCreds(d: Deps, userId: string): Promise<Credentials | null> {
  const text = await d.store.get(credPath(userId));
  if (!text) return null;
  try {
    return JSON.parse(text) as Credentials;
  } catch {
    return null;
  }
}

/**
 * After the app moved to another host the secret changed, so ids (derived from it) differ. The
 * account of this login under its OLD id is found through the readable login kept in `meta/`.
 * An account that was only restored (no password) is not an account anyone can sign in to.
 */
async function legacyAccount(
  d: Deps,
  login: string,
  newId: string,
): Promise<{ id: string; creds: Credentials; meta: string } | null> {
  if (!d.store.list) return null;
  for (const path of await d.store.list('meta/')) {
    const id = path.slice('meta/'.length).replace(/\.json$/, '');
    if (id === newId) continue;
    const meta = await d.store.get(path);
    let found: { login?: string } | null = null;
    try {
      found = meta ? (JSON.parse(meta) as { login?: string }) : null;
    } catch {
      found = null;
    }
    if (found?.login !== login) continue;
    const creds = await readCreds(d, id);
    if (creds) return { id, creds, meta: meta as string };
  }
  return null;
}

const hasPassword = (c: Credentials) => !c.restored && c.hash !== '';

/** Moves an old account (checked with its password) under the new id: credentials, meta, diary. */
async function adoptLegacy(
  d: Deps,
  userId: string,
  login: string,
  old: { id: string; creds: Credentials; meta: string },
): Promise<void> {
  await d.store.put(credPath(userId), JSON.stringify({ ...old.creds, sessionsFrom: d.now() }));
  try {
    const meta = JSON.parse(old.meta) as Record<string, unknown>;
    await d.store.put(metaPath(userId), JSON.stringify({ ...meta, login, lastLogin: d.now() }));
  } catch {
    await touchMeta(d, userId, login, true);
  }
  const diary = await d.store.get(`users/${old.id}.json`);
  if (diary !== null) await d.store.put(`users/${userId}.json`, diary);
  // The account now exists once: the old record goes (no twin in the administrator's list, and
  // it cannot come back after the account is deleted). Only after the copy is confirmed.
  const moved =
    (await readCreds(d, userId)) !== null &&
    (diary === null || (await d.store.get(`users/${userId}.json`)) === diary);
  if (moved && d.store.remove) {
    for (const kind of ['creds', 'meta', 'users']) await d.store.remove(`${kind}/${old.id}.json`);
  }
}

/**
 * The user a request belongs to: a valid token of an existing account that was issued after
 * the last password change (a password change signs every older device out).
 */
export async function userOf(d: Deps, req: Request): Promise<string | null> {
  const token = bearer(req);
  const info = token ? sessionInfo(d.secret, token, d.now()) : null;
  if (!info) return null;
  const creds = (await readCreds(d, info.userId)) ?? (await restoreAccount(d, req, info.userId));
  if (!creds || info.issuedAt < (creds.sessionsFrom ?? 0)) return null;
  return info.userId;
}

/**
 * After the storage was replaced, a valid signed session (our secret made it) of an account the
 * new storage does not know recreates the account, with no password: the owner stays signed in
 * and sets a new password later. Only while `restoreUntil` is open. Someone who registered the
 * same login first is not affected: that account exists and ignores older sessions.
 */
async function restoreAccount(d: Deps, req: Request, userId: string): Promise<Credentials | null> {
  if (!d.restoreUntil || d.now() > d.restoreUntil) return null;
  const creds: Credentials = { salt: '', hash: '', restored: true };
  await d.store.put(credPath(userId), JSON.stringify(creds));
  const login = normalizeLogin(req.headers.get('x-account-login') ?? '');
  if (isValidLogin(login) && userIdFor(d.secret, login) === userId)
    await touchMeta(d, userId, login, true);
  return creds;
}

const SEEN_EVERY_MS = 10 * 60 * 1000;

/**
 * Every sync is a visit: remembers when the account was last in the app (at most once per ten
 * minutes). The login comes from a header and is trusted only if it hashes to this account, so
 * accounts signed in long ago appear in the administrator's list without signing in again.
 */
async function touchSeen(d: Deps, req: Request, userId: string): Promise<void> {
  try {
    const login = normalizeLogin(req.headers.get('x-account-login') ?? '');
    if (!isValidLogin(login) || userIdFor(d.secret, login) !== userId) return;
    const old = JSON.parse((await d.store.get(metaPath(userId))) ?? 'null') as {
      login?: string;
      createdAt?: number;
      lastLogin?: number;
      lastSeen?: number;
    } | null;
    if (old?.login === login && old.lastSeen && d.now() - old.lastSeen < SEEN_EVERY_MS) return;
    await d.store.put(
      metaPath(userId),
      JSON.stringify({ ...old, login, createdAt: old?.createdAt ?? d.now(), lastSeen: d.now() }),
    );
  } catch (e) {
    console.error('seen update failed', e);
  }
}

const delay = (d: Deps) =>
  d.failDelayMs ? new Promise((r) => setTimeout(r, d.failDelayMs?.())) : null;

/** Parses and validates {login, password}; null + response on problems. */
async function credentials(
  req: Request,
): Promise<{ fail: Response } | { login: string; password: string }> {
  const body = await readJson(req);
  const login = normalizeLogin(String(body?.login ?? ''));
  const password = String(body?.password ?? '');
  if (!isValidLogin(login)) return { fail: json({ error: 'bad_login' }, 400) };
  if (!isValidPassword(password)) return { fail: json({ error: 'bad_password' }, 400) };
  return { login, password };
}

const newAccount = async (password: string) => {
  const recoveryCode = generateRecoveryCode();
  const creds: Credentials = {
    ...(await hashSecret(password)),
    recovery: await hashSecret(normalizeRecovery(recoveryCode)),
  };
  return { creds, recoveryCode };
};

/** POST {login, password} → creates the account, signs in, returns the one-time recovery code. */
export async function register(d: Deps, req: Request): Promise<Response> {
  if (!d.signupOpen) return json({ error: 'signup_closed' }, 403);
  const c = await credentials(req);
  if ('fail' in c) return c.fail;
  const userId = userIdFor(d.secret, c.login);
  if (await readCreds(d, userId)) return json({ error: 'taken' }, 409);
  // Taken by an account that moved with the host (it has a password); a password-less one is not.
  const old = await legacyAccount(d, c.login, userId);
  if (old && hasPassword(old.creds)) return json({ error: 'taken' }, 409);
  const { creds, recoveryCode } = await newAccount(c.password);
  // Sessions issued before this moment belong to nobody: an old token of the same login (from
  // before the storage was replaced) must not open a newly registered account.
  const now = d.now();
  await d.store.put(credPath(userId), JSON.stringify({ ...creds, sessionsFrom: now }));
  await touchMeta(d, userId, c.login, true);
  return json({ token: createSession(d.secret, userId, now), login: c.login, recoveryCode });
}

export const MAX_FAILURES = 8;
export const LOCK_MS = 15 * 60 * 1000;
type Attempts = { n: number; until?: number };

/**
 * Wrong guesses are counted per account AND per caller address, so a stranger who keeps
 * guessing is locked out for a while, but cannot lock the owner out of their own account.
 */
function attemptsPath(d: Deps, req: Request, userId: string): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  const who = createHash('sha256').update(`${d.secret}|ip|${ip}`).digest('hex').slice(0, 16);
  return `attempts/${userId}-${who}.json`;
}

async function readAttempts(d: Deps, path: string): Promise<Attempts> {
  try {
    const v = JSON.parse((await d.store.get(path)) ?? '{}') as Attempts;
    return { n: Number(v.n) || 0, ...(v.until ? { until: Number(v.until) } : {}) };
  } catch {
    return { n: 0 };
  }
}

/** A reply when this caller is locked out of this account after too many guesses; else null. */
async function lockedReply(d: Deps, req: Request, userId: string): Promise<Response | null> {
  const a = await readAttempts(d, attemptsPath(d, req, userId));
  if (!a.until || a.until <= d.now()) return null;
  return json(
    { error: 'too_many_attempts', retryAfterSec: Math.ceil((a.until - d.now()) / 1000) },
    429,
  );
}

/** Counts a wrong guess; after MAX_FAILURES the caller is locked for LOCK_MS. */
async function recordFailure(d: Deps, req: Request, userId: string): Promise<void> {
  const path = attemptsPath(d, req, userId);
  const n = (await readAttempts(d, path)).n + 1;
  const next: Attempts = n >= MAX_FAILURES ? { n: 0, until: d.now() + LOCK_MS } : { n };
  await d.store.put(path, JSON.stringify(next));
}

async function clearFailures(d: Deps, req: Request, userId: string): Promise<void> {
  const path = attemptsPath(d, req, userId);
  if ((await readAttempts(d, path)).n > 0) await d.store.put(path, '{"n":0}');
}

/**
 * A failed attempt: slow answer, same reply for unknown login and wrong secret. Guesses at
 * an existing account are counted (unknown logins are not, so nobody can fill the storage).
 */
async function failed(d: Deps, req: Request, userId?: string): Promise<Response> {
  if (userId) await recordFailure(d, req, userId);
  await delay(d);
  return json({ error: 'wrong_credentials' }, 401);
}

/** POST {login, password} → {token, login}. */
export async function login(d: Deps, req: Request): Promise<Response> {
  const c = await credentials(req);
  if ('fail' in c) return c.fail;
  const userId = userIdFor(d.secret, c.login);
  const locked = await lockedReply(d, req, userId);
  if (locked) return locked;
  let creds = await readCreds(d, userId);
  if (!creds) {
    // The same person after a move to another host: the old account, checked with the password.
    const old = await legacyAccount(d, c.login, userId);
    if (old && hasPassword(old.creds)) {
      if (!(await checkSecret(old.creds, c.password))) return failed(d, req, userId);
      await adoptLegacy(d, userId, c.login, old);
      creds = await readCreds(d, userId);
    }
  }
  // Unknown users cost the same hashing time, so timing does not reveal them.
  const ok = creds ? await checkSecret(creds, c.password) : (await hashSecret(c.password), false);
  if (!creds || !ok) return failed(d, req, creds ? userId : undefined);
  await clearFailures(d, req, userId);
  await touchMeta(d, userId, c.login, false);
  return json({ token: createSession(d.secret, userId, d.now()), login: c.login });
}

/** POST {login, recoveryCode, password} → sets a new password; returns a fresh recovery code. */
export async function resetPassword(d: Deps, req: Request): Promise<Response> {
  const body = await readJson(req);
  const c = await credentials(
    new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ login: body?.login, password: body?.password }),
    }),
  );
  if ('fail' in c) return c.fail;
  const code = normalizeRecovery(String(body?.recoveryCode ?? ''));
  const userId = userIdFor(d.secret, c.login);
  const locked = await lockedReply(d, req, userId);
  if (locked) return locked;
  let creds = await readCreds(d, userId);
  if (!creds) {
    // An account that moved with the host: the recovery code is checked against the old one.
    const old = await legacyAccount(d, c.login, userId);
    if (old?.creds.recovery && (await checkSecret(old.creds.recovery, code))) {
      await adoptLegacy(d, userId, c.login, old);
      creds = await readCreds(d, userId);
    }
  }
  const ok = creds?.recovery
    ? await checkSecret(creds.recovery, code)
    : (await hashSecret(code), false);
  if (!creds || !ok) return failed(d, req, creds ? userId : undefined);
  await clearFailures(d, req, userId);
  const fresh = await newAccount(c.password);
  // A reset is the "I lost control" case: all older sessions end.
  await d.store.put(credPath(userId), JSON.stringify({ ...fresh.creds, sessionsFrom: d.now() }));
  return json({
    token: createSession(d.secret, userId, d.now()),
    login: c.login,
    recoveryCode: fresh.recoveryCode,
  });
}

/** POST {password} (signed in) → issues a new recovery code, replacing any previous one. */
export async function newRecovery(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(req);
  const locked = await lockedReply(d, req, userId);
  if (locked) return locked;
  const creds = await readCreds(d, userId);
  if (!creds) return json({ error: 'unauthorized' }, 401);
  if (!(await checkSecret(creds, String(body?.password ?? '')))) return failed(d, req, userId);
  await clearFailures(d, req, userId);
  const recoveryCode = generateRecoveryCode();
  const updated: Credentials = {
    ...creds,
    recovery: await hashSecret(normalizeRecovery(recoveryCode)),
  };
  await d.store.put(credPath(userId), JSON.stringify(updated));
  return json({ recoveryCode });
}

/** POST {password, newPassword} (signed in) → changes the password; data and recovery code stay. */
export async function changePassword(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(req);
  const creds = await readCreds(d, userId);
  if (!creds) return json({ error: 'unauthorized' }, 401);
  const next = String(body?.newPassword ?? '');
  if (!isValidPassword(next)) return json({ error: 'bad_password' }, 400);
  const locked = await lockedReply(d, req, userId);
  if (locked) return locked;
  if (!(await checkSecret(creds, String(body?.password ?? '')))) return failed(d, req, userId);
  await clearFailures(d, req, userId);
  // Every device that signed in before this moment is signed out; this one gets a fresh token.
  const now = d.now();
  await d.store.put(
    credPath(userId),
    JSON.stringify({ ...creds, ...(await hashSecret(next)), sessionsFrom: now }),
  );
  return json({ ok: true, token: createSession(d.secret, userId, now) });
}

/**
 * POST {newPassword} (signed in, restored account only) → sets the first password and issues the
 * recovery code. Devices stay signed in. A normal account changes its password the usual way.
 */
export async function setRestoredPassword(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const creds = await readCreds(d, userId);
  if (!creds?.restored) return json({ error: 'not_restored' }, 409);
  const body = await readJson(req);
  const next = String(body?.newPassword ?? '');
  if (!isValidPassword(next)) return json({ error: 'bad_password' }, 400);
  const fresh = await newAccount(next);
  const { restored: _gone, ...rest } = creds;
  await d.store.put(credPath(userId), JSON.stringify({ ...rest, ...fresh.creds }));
  return json({ ok: true, recoveryCode: fresh.recoveryCode });
}

const dataPath = (userId: string) => `users/${userId}.json`;

/** GET → the stored snapshot (or {empty:true}). */
export async function getSync(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  await touchSeen(d, req, userId);
  const text = await d.store.get(dataPath(userId));
  // Personal button texts set by the administrator travel in a header (URL-encoded JSON).
  const mine = Object.entries(d.userLabels ?? {}).find(
    ([login]) => userIdFor(d.secret, login) === userId,
  )?.[1];
  const extra: Record<string, string> = mine
    ? { 'x-ui-labels': encodeURIComponent(JSON.stringify(mine)) }
    : {};
  // A restored account has no password yet: the app asks the owner to set one.
  if ((await readCreds(d, userId))?.restored) extra['x-account-restored'] = '1';
  return text
    ? new Response(text, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          ...extra,
        },
      })
    : new Response(JSON.stringify({ empty: true }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
      });
}

/** PUT <snapshot json> → stores it for the signed-in user. */
export async function putSync(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const text = await req.text();
  if (text.length > MAX_SYNC_BYTES) return json({ error: 'too_large' }, 413);
  let parsed: { format?: string; tables?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  if (parsed.format !== 'dnevnik-backup' || typeof parsed.tables !== 'object')
    return json({ error: 'bad_format' }, 400);
  await d.store.put(dataPath(userId), text);
  return json({ ok: true });
}

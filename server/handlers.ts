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
 * The user a request belongs to: a valid token of an existing account that was issued after
 * the last password change (a password change signs every older device out).
 */
export async function userOf(d: Deps, req: Request): Promise<string | null> {
  const token = bearer(req);
  const info = token ? sessionInfo(d.secret, token, d.now()) : null;
  if (!info) return null;
  const creds = await readCreds(d, info.userId);
  if (!creds || info.issuedAt < (creds.sessionsFrom ?? 0)) return null;
  return info.userId;
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
  const { creds, recoveryCode } = await newAccount(c.password);
  await d.store.put(credPath(userId), JSON.stringify(creds));
  await touchMeta(d, userId, c.login, true);
  return json({ token: createSession(d.secret, userId, d.now()), login: c.login, recoveryCode });
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
  const creds = await readCreds(d, userId);
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
  const creds = await readCreds(d, userId);
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

const dataPath = (userId: string) => `users/${userId}.json`;

/** GET → the stored snapshot (or {empty:true}). */
export async function getSync(d: Deps, req: Request): Promise<Response> {
  const userId = await userOf(d, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  await touchSeen(d, req, userId);
  const text = await d.store.get(dataPath(userId));
  return text
    ? new Response(text, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    : json({ empty: true });
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

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
  verifySession,
  type Credentials,
} from './auth.js';
import type { Deps } from './types.js';

export const MAX_SYNC_BYTES = 4 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const readJson = async (req: Request): Promise<Record<string, unknown> | null> => {
  try {
    const v = (await req.json()) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const bearer = (req: Request) =>
  /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;

const credPath = (userId: string) => `creds/${userId}.json`;

async function readCreds(d: Deps, userId: string): Promise<Credentials | null> {
  const text = await d.store.get(credPath(userId));
  if (!text) return null;
  try {
    return JSON.parse(text) as Credentials;
  } catch {
    return null;
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
  return json({ token: createSession(d.secret, userId, d.now()), login: c.login, recoveryCode });
}

/** A failed attempt: slow answer, same reply for unknown login and wrong secret. */
async function failed(d: Deps): Promise<Response> {
  await delay(d);
  return json({ error: 'wrong_credentials' }, 401);
}

/** POST {login, password} → {token, login}. */
export async function login(d: Deps, req: Request): Promise<Response> {
  const c = await credentials(req);
  if ('fail' in c) return c.fail;
  const userId = userIdFor(d.secret, c.login);
  const creds = await readCreds(d, userId);
  // Unknown users cost the same hashing time, so timing does not reveal them.
  const ok = creds ? await checkSecret(creds, c.password) : (await hashSecret(c.password), false);
  if (!creds || !ok) return failed(d);
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
  const creds = await readCreds(d, userId);
  const ok = creds?.recovery
    ? await checkSecret(creds.recovery, code)
    : (await hashSecret(code), false);
  if (!creds || !ok) return failed(d);
  const fresh = await newAccount(c.password);
  await d.store.put(credPath(userId), JSON.stringify(fresh.creds));
  return json({
    token: createSession(d.secret, userId, d.now()),
    login: c.login,
    recoveryCode: fresh.recoveryCode,
  });
}

/** POST {password} (signed in) → issues a new recovery code, replacing any previous one. */
export async function newRecovery(d: Deps, req: Request): Promise<Response> {
  const token = bearer(req);
  const userId = token ? verifySession(d.secret, token, d.now()) : null;
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(req);
  const creds = await readCreds(d, userId);
  if (!creds) return json({ error: 'unauthorized' }, 401);
  if (!(await checkSecret(creds, String(body?.password ?? '')))) return failed(d);
  const recoveryCode = generateRecoveryCode();
  const updated: Credentials = {
    ...creds,
    recovery: await hashSecret(normalizeRecovery(recoveryCode)),
  };
  await d.store.put(credPath(userId), JSON.stringify(updated));
  return json({ recoveryCode });
}

const dataPath = (userId: string) => `users/${userId}.json`;

/** GET → the stored snapshot (or {empty:true}). */
export async function getSync(d: Deps, req: Request): Promise<Response> {
  const token = bearer(req);
  const userId = token ? verifySession(d.secret, token, d.now()) : null;
  if (!userId) return json({ error: 'unauthorized' }, 401);
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
  const token = bearer(req);
  const userId = token ? verifySession(d.secret, token, d.now()) : null;
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

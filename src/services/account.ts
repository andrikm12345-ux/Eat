import type { Repos } from '../db/repos';

/** Settings holding the signed-in session (never exported or synced). */
export const ACCOUNT = {
  token: 'accountToken',
  login: 'accountLogin',
  lastSync: 'accountLastSync',
  /** The server offers a shared AI to this signed-in user / this user administers it. */
  aiShared: 'accountAiShared',
  aiAdmin: 'accountAiAdmin',
  /** The visitor chose to start without an account. */
  skipped: 'accountSkipped',
} as const;

/** What a failed reply means for the user: wrong secret, or locked for a while. */
const failure = (status: number): AccountError =>
  status === 401 ? 'wrong_credentials' : status === 429 ? 'too_many_attempts' : 'unknown';

export type AccountError =
  | 'bad_login'
  | 'bad_password'
  | 'taken'
  | 'wrong_credentials'
  | 'too_many_attempts'
  | 'signup_closed'
  | 'network'
  | 'unknown';

type Reply = {
  token?: string;
  login?: string;
  recoveryCode?: string;
  error?: string;
};

async function auth(
  r: Repos,
  kind: 'register' | 'login' | 'reset',
  body: Record<string, string>,
): Promise<{ login: string; recoveryCode?: string } | { error: AccountError }> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'network' };
  }
  const data = (await res.json().catch(() => ({}))) as Reply;
  if (res.ok && data.token && data.login) {
    await r.settings.set(ACCOUNT.token, data.token);
    await r.settings.set(ACCOUNT.login, data.login);
    return { login: data.login, recoveryCode: data.recoveryCode };
  }
  const known: AccountError[] = [
    'bad_login',
    'bad_password',
    'taken',
    'wrong_credentials',
    'too_many_attempts',
    'signup_closed',
  ];
  const error = known.find((k) => k === data.error) ?? 'unknown';
  return { error };
}

/** Creates an account and signs in. */
export const registerAccount = (r: Repos, login: string, password: string) =>
  auth(r, 'register', { login, password });

/** Signs in to an existing account. */
export const loginAccount = (r: Repos, login: string, password: string) =>
  auth(r, 'login', { login, password });

/** Sets a new password using the recovery code; returns a fresh recovery code. */
export const resetAccount = (r: Repos, login: string, recoveryCode: string, password: string) =>
  auth(r, 'reset', { login, recoveryCode, password });

export async function getSession(r: Repos): Promise<{ token: string; login: string } | null> {
  const [token, login] = await Promise.all([
    r.settings.get<string>(ACCOUNT.token, ''),
    r.settings.get<string>(ACCOUNT.login, ''),
  ]);
  return token ? { token, login } : null;
}

export async function signOut(r: Repos) {
  for (const k of Object.values(ACCOUNT)) await r.db.settings.delete(k);
}

/** Issues a new recovery code for the signed-in account (needs the current password). */
export async function createRecoveryCode(
  r: Repos,
  password: string,
): Promise<{ recoveryCode: string } | { error: AccountError }> {
  const session = await getSession(r);
  if (!session) return { error: 'wrong_credentials' };
  let res: Response;
  try {
    res = await fetch('/api/auth/recovery', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { error: 'network' };
  }
  const data = (await res.json().catch(() => ({}))) as Reply;
  if (res.ok && data.recoveryCode) return { recoveryCode: data.recoveryCode };
  return { error: failure(res.status) };
}

/** Changes the password of the signed-in account. */
export async function changeAccountPassword(
  r: Repos,
  password: string,
  newPassword: string,
): Promise<{ ok: true } | { error: AccountError }> {
  const session = await getSession(r);
  if (!session) return { error: 'wrong_credentials' };
  let res: Response;
  try {
    res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ password, newPassword }),
    });
  } catch {
    return { error: 'network' };
  }
  const data = (await res.json().catch(() => ({}))) as Reply;
  if (res.ok) {
    // The server signed every other device out and issued a new token for this one.
    if (data.token) await r.settings.set(ACCOUNT.token, data.token);
    return { ok: true };
  }
  if (data.error === 'bad_password') return { error: 'bad_password' };
  return { error: failure(res.status) };
}

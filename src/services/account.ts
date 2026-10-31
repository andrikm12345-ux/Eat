import type { Repos } from '../db/repos';

/** Settings holding the signed-in session (never exported or synced). */
export const ACCOUNT = {
  token: 'accountToken',
  login: 'accountLogin',
  lastSync: 'accountLastSync',
} as const;

export type AccountError =
  | 'bad_login'
  | 'bad_password'
  | 'taken'
  | 'wrong_credentials'
  | 'locked'
  | 'signup_closed'
  | 'network'
  | 'unknown';

type Reply = {
  token?: string;
  login?: string;
  recoveryCode?: string;
  error?: string;
  retryAfterSec?: number;
};

async function auth(
  r: Repos,
  kind: 'register' | 'login' | 'reset',
  body: Record<string, string>,
): Promise<
  { login: string; recoveryCode?: string } | { error: AccountError; retryAfterSec?: number }
> {
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
    'locked',
    'signup_closed',
  ];
  const error = known.find((k) => k === data.error) ?? 'unknown';
  return { error, retryAfterSec: data.retryAfterSec };
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

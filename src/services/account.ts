import type { Repos } from '../db/repos';

/** Settings holding the signed-in session (never exported or synced). */
export const ACCOUNT = {
  token: 'accountToken',
  email: 'accountEmail',
  lastSync: 'accountLastSync',
} as const;

export type AccountError = 'invalid_email' | 'bad_code' | 'mail' | 'network' | 'unknown';

async function post<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: data as T };
  return { ok: false, status: res.status, error: String(data.error ?? 'unknown') };
}

const toError = (status: number, error: string): AccountError => {
  if (status === 0) return 'network';
  if (error === 'bad_email') return 'invalid_email';
  if (error === 'bad_code') return 'bad_code';
  if (error.startsWith('mail_')) return 'mail';
  return 'unknown';
};

/** Asks the server to email a code. Returns the challenge to send back with the code. */
export async function requestCode(
  email: string,
): Promise<{ challenge: string; digits: number } | { error: AccountError }> {
  const r = await post<{ challenge: string; digits: number }>('/api/auth/request', { email });
  return r.ok ? r.data : { error: toError(r.status, r.error) };
}

/** Exchanges the emailed code for a session and stores it. */
export async function verifyCode(
  r: Repos,
  challenge: string,
  code: string,
): Promise<{ email: string } | { error: AccountError }> {
  const res = await post<{ token: string; email: string }>('/api/auth/verify', { challenge, code });
  if (!res.ok) return { error: toError(res.status, res.error) };
  await r.settings.set(ACCOUNT.token, res.data.token);
  await r.settings.set(ACCOUNT.email, res.data.email);
  return { email: res.data.email };
}

export async function getSession(r: Repos): Promise<{ token: string; email: string } | null> {
  const [token, email] = await Promise.all([
    r.settings.get<string>(ACCOUNT.token, ''),
    r.settings.get<string>(ACCOUNT.email, ''),
  ]);
  return token ? { token, email } : null;
}

export async function signOut(r: Repos) {
  for (const k of Object.values(ACCOUNT)) await r.db.settings.delete(k);
}

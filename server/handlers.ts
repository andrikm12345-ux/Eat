import {
  createChallenge,
  createSession,
  isValidEmail,
  normalizeEmail,
  userIdFor,
  verifyChallenge,
  verifySession,
  CODE_DIGITS,
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

/** POST {email} → sends a code; returns {challenge} to be echoed back with the code. */
export async function requestCode(d: Deps, req: Request): Promise<Response> {
  const body = await readJson(req);
  const email = normalizeEmail(String(body?.email ?? ''));
  if (!isValidEmail(email)) return json({ error: 'bad_email' }, 400);
  // Don't reveal whether an address is allowed: pretend to send.
  const { challenge, code } = createChallenge(d.secret, email, d.now());
  if (d.allowed.length === 0 || d.allowed.includes(email)) {
    try {
      await d.mail(email, code);
    } catch (e) {
      return json(
        {
          error:
            e instanceof Error && e.message === 'mail_not_configured'
              ? 'mail_not_configured'
              : 'mail_failed',
        },
        503,
      );
    }
  }
  return json({ challenge, digits: CODE_DIGITS });
}

/** POST {challenge, code} → {token, email}. */
export async function verifyCode(d: Deps, req: Request): Promise<Response> {
  const body = await readJson(req);
  const email = verifyChallenge(
    d.secret,
    String(body?.challenge ?? ''),
    String(body?.code ?? ''),
    d.now(),
  );
  if (!email || (d.allowed.length > 0 && !d.allowed.includes(email))) {
    if (d.failDelayMs) await new Promise((r) => setTimeout(r, d.failDelayMs?.()));
    return json({ error: 'bad_code' }, 401);
  }
  return json({ token: createSession(d.secret, userIdFor(d.secret, email), d.now()), email });
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

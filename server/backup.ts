import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { bearer, json } from './http.js';
import type { Deps } from './types.js';

/**
 * Encrypted backup of the storage. The key is derived from AUTH_SECRET (the server has it; it is
 * never shown, so only this server can read a backup back). A scheduled job (GitHub Actions)
 * pulls the parts with BACKUP_TOKEN and keeps them in a branch; restoring goes the other way,
 * through this server.
 *
 * GET  /api/backup?prefix=creds/  → {v, at, prefix, iv, data}  (AES-256-GCM of {path: text})
 * POST /api/backup  <that JSON>   → writes the paths back (same token)
 */
const ALLOWED = ['creds/', 'meta/', 'users/', 'admin/', 'usage/', 'search-usage/'] as const;
/** Backups skip short-lived things (counters of wrong passwords, AI jobs, audit, health). */
const part = (p: string) => ALLOWED.some((a) => p.startsWith(a));

const key = (secret: string) =>
  Buffer.from(hkdfSync('sha256', secret, 'dnevnik-backup', 'backup-v1', 32));

export type Sealed = { v: 1; at: number; prefix: string; iv: string; data: string };

export function seal(
  secret: string,
  prefix: string,
  files: Record<string, string>,
  at: number,
): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const body = Buffer.concat([c.update(JSON.stringify(files), 'utf8'), c.final()]);
  return {
    v: 1,
    at,
    prefix,
    iv: iv.toString('base64'),
    data: Buffer.concat([body, c.getAuthTag()]).toString('base64'),
  };
}

export function open(secret: string, s: Sealed): Record<string, string> {
  const raw = Buffer.from(s.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(s.iv, 'base64'));
  d.setAuthTag(raw.subarray(raw.length - 16));
  const text = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString(
    'utf8',
  );
  return JSON.parse(text) as Record<string, string>;
}

const authorized = (token: string | undefined, req: Request) => {
  const given = bearer(req);
  if (!token || token.length < 24 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function backup(d: Deps, req: Request, token: string | undefined): Promise<Response> {
  // Not configured (no BACKUP_TOKEN): the endpoint does not exist.
  if (!token) return json({ error: 'not_found' }, 404);
  if (!authorized(token, req)) return json({ error: 'unauthorized' }, 401);
  if (!d.store.list) return json({ error: 'unsupported' }, 501);

  if (req.method === 'GET') {
    const prefix = new URL(req.url).searchParams.get('prefix') ?? '';
    if (!part(prefix)) return json({ error: 'bad_prefix' }, 400);
    const files: Record<string, string> = {};
    for (const path of await d.store.list(prefix)) {
      const text = await d.store.get(path);
      if (text !== null) files[path] = text;
    }
    return json(seal(d.secret, prefix, files, d.now()));
  }

  if (req.method === 'POST') {
    let sealed: Sealed;
    try {
      sealed = (await req.json()) as Sealed;
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    let files: Record<string, string>;
    try {
      files = open(d.secret, sealed);
    } catch {
      // Wrong key (a different AUTH_SECRET) or a damaged file: nothing is written.
      return json({ error: 'cannot_decrypt' }, 422);
    }
    let written = 0;
    for (const [path, text] of Object.entries(files)) {
      if (!part(path) || path.includes('..') || typeof text !== 'string') continue;
      await d.store.put(path, text);
      written += 1;
    }
    return json({ ok: true, written });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

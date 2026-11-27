import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { fromWorkflow, verifyGithubToken } from './githubOidc.js';
import { bearer, json } from './http.js';
import type { Deps } from './types.js';

/**
 * Encrypted backup of the storage. The key is derived from AUTH_SECRET (the server has it; it is
 * never shown, so only this server can read a backup back). A scheduled job (GitHub Actions)
 * pulls the parts (proving itself with GitHub's identity token) and keeps them in a branch; restoring goes the other way,
 * through this server.
 *
 * No shared secret: the job proves who it is with the identity token GitHub gives it (OIDC):
 * `backup.yml` of this repository on main may read, `restore.yml` may write.
 *
 * GET  /api/backup?prefix=creds/  → {v, at, prefix, iv, data}  (AES-256-GCM of {path: text})
 * POST /api/backup  <that JSON>   → writes the paths back
 */
const ALLOWED = ['creds/', 'meta/', 'users/', 'admin/', 'usage/', 'search-usage/'] as const;
/**
 * The server settings (keys, tokens) travel as one more sealed part named `env/`. It is only read
 * (never written back by a restore: it is not in ALLOWED) and only when BACKUP_KEY is set, so they
 * are never sealed with a key made from one of them.
 */
const ENV_PART = 'env/';
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

export async function backup(d: Deps, req: Request, repo: string): Promise<Response> {
  const token = bearer(req);
  const claims = token ? await verifyGithubToken(token, d.fetchImpl ?? fetch, d.now()) : null;
  if (!claims) return json({ error: 'unauthorized' }, 401);
  // Reading: the weekly job (or a manual run of it). Writing: only the restore job.
  const mayRead = fromWorkflow(claims, repo, 'backup.yml', ['schedule', 'workflow_dispatch']);
  const mayWrite = fromWorkflow(claims, repo, 'restore.yml', ['workflow_dispatch']);
  if (!(req.method === 'GET' ? mayRead : mayWrite)) return json({ error: 'forbidden' }, 403);
  if (!d.store.list) return json({ error: 'unsupported' }, 501);

  if (req.method === 'GET') {
    const prefix = new URL(req.url).searchParams.get('prefix') ?? '';
    if (prefix === ENV_PART) {
      const env = d.backupKey && d.envSnapshot ? d.envSnapshot() : {};
      const files = Object.fromEntries(Object.entries(env).map(([k, v]) => [`env/${k}`, v]));
      return json(seal(d.backupKey ?? d.secret, prefix, files, d.now()));
    }
    if (!part(prefix)) return json({ error: 'bad_prefix' }, 400);
    const files: Record<string, string> = {};
    for (const path of await d.store.list(prefix)) {
      const text = await d.store.get(path);
      if (text !== null) files[path] = text;
    }
    return json(seal(d.backupKey ?? d.secret, prefix, files, d.now()));
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
      files = open(d.backupKey ?? d.secret, sealed);
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

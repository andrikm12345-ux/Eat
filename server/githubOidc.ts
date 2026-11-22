import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

/**
 * Checks the identity token GitHub Actions gives to a running workflow (OIDC): a JWT signed by
 * GitHub. Nothing secret is shared with GitHub: the server only trusts GitHub's public keys and
 * the claims (which repository, which branch, which workflow file).
 */
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
export const BACKUP_AUDIENCE = 'dnevnik-backup';

type Jwk = JsonWebKey & { kid?: string };
let cache: { at: number; keys: Jwk[] } | null = null;

async function keys(f: typeof fetch, now: number, force = false): Promise<Jwk[]> {
  if (!force && cache && now - cache.at < 10 * 60_000) return cache.keys;
  const res = await f(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  cache = { at: now, keys: ((await res.json()) as { keys: Jwk[] }).keys };
  return cache.keys;
}

export const resetOidcCache = () => {
  cache = null;
};

const b64json = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;

export type Claims = {
  repository?: string;
  ref?: string;
  event_name?: string;
  job_workflow_ref?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
};

/** The claims when the token is genuine, unexpired and for our audience; otherwise null. */
export async function verifyGithubToken(
  token: string,
  f: typeof fetch,
  now: number,
): Promise<Claims | null> {
  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = b64json(h) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    let jwk = (await keys(f, now)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(f, now, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const ok = createVerify('RSA-SHA256')
      .update(`${h}.${p}`)
      .verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sig, 'base64url'));
    if (!ok) return null;
    const c = b64json(p) as Claims;
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    const sec = Math.floor(now / 1000);
    if (c.iss !== ISSUER || !aud.includes(BACKUP_AUDIENCE)) return null;
    if (typeof c.exp !== 'number' || c.exp + 60 < sec) return null;
    if (typeof c.nbf === 'number' && c.nbf - 60 > sec) return null;
    return c;
  } catch {
    return null;
  }
}

/** True when the claims say: this repository, the main branch, and exactly this workflow file. */
export function fromWorkflow(c: Claims, repo: string, file: string, events: string[]): boolean {
  return (
    c.repository === repo &&
    c.ref === 'refs/heads/main' &&
    events.includes(c.event_name ?? '') &&
    c.job_workflow_ref === `${repo}/.github/workflows/${file}@refs/heads/main`
  );
}

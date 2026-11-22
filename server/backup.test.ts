import { generateKeyPairSync, createSign } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { backup, open, seal, type Sealed } from './backup.js';
import { resetOidcCache } from './githubOidc.js';
import type { Deps, Store } from './types.js';

const SECRET = 's'.repeat(40);
const REPO = 'andrikm12345-ux/Eat';
const NOW = Date.UTC(2026, 10, 29, 3, 17, 0);

// A stand-in for GitHub: its own key pair and a key list the fake fetch serves.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwksFetch = (async () =>
  new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(over: Record<string, unknown> = {}, key = pair.privateKey, kid = 'k1') {
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'dnevnik-backup',
    repository: REPO,
    ref: 'refs/heads/main',
    event_name: 'schedule',
    job_workflow_ref: `${REPO}/.github/workflows/backup.yml@refs/heads/main`,
    exp: Math.floor(NOW / 1000) + 300,
    nbf: Math.floor(NOW / 1000) - 5,
    ...over,
  };
  const head = `${b64({ alg: 'RS256', typ: 'JWT', kid })}.${b64(claims)}`;
  return `${head}.${createSign('RSA-SHA256').update(head).sign(key).toString('base64url')}`;
}
const restoreJwt = (over: Record<string, unknown> = {}) =>
  jwt({
    event_name: 'workflow_dispatch',
    job_workflow_ref: `${REPO}/.github/workflows/restore.yml@refs/heads/main`,
    ...over,
  });

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (p) => data.get(p) ?? null,
    put: async (p, b) => void data.set(p, b),
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
};
const deps = (secret = SECRET, store: Store = memory()): Deps => ({
  secret,
  store,
  now: () => NOW,
  signupOpen: true,
  fetchImpl: jwksFetch,
});
const call = (d: Deps, method: string, qs = '', token: string | null = jwt(), body?: unknown) =>
  backup(
    d,
    new Request(`http://x/api/backup${qs}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    REPO,
  );

beforeEach(() => resetOidcCache());

describe('encrypted backup', () => {
  it('seals and opens; a wrong key or a damaged file does not open', () => {
    const files = { 'creds/a.json': '{"hash":"h"}', 'users/b.json': 'я'.repeat(1000) };
    const s = seal(SECRET, 'creds/', files, 5);
    expect(JSON.stringify(s)).not.toContain('hash');
    expect(open(SECRET, s)).toEqual(files);
    expect(() => open('o'.repeat(40), s)).toThrow();
    expect(() => open(SECRET, { ...s, data: s.data.slice(0, -8) + 'AAAAAAAA' })).toThrow();
  });
});

describe('who may call the backup address (GitHub identity token, no shared secret)', () => {
  it('the weekly job of this repository on main may read; manual run of it too', async () => {
    const d = deps();
    expect((await call(d, 'GET', '?prefix=creds/')).status).toBe(200);
    const manual = jwt({ event_name: 'workflow_dispatch' });
    expect((await call(d, 'GET', '?prefix=creds/', manual)).status).toBe(200);
  });

  it('nobody else: no token, a forged one, another repository, branch, workflow or audience', async () => {
    const d = deps();
    const get = (t: string | null) => call(d, 'GET', '?prefix=creds/', t);
    expect((await get(null)).status).toBe(401);
    expect((await get('abc.def.ghi')).status).toBe(401);
    // signed with a key GitHub does not publish
    expect((await get(jwt({}, other.privateKey))).status).toBe(401);
    expect((await get(jwt({}, pair.privateKey, 'unknown'))).status).toBe(401);
    // right signature, wrong claims
    expect((await get(jwt({ aud: 'something-else' }))).status).toBe(401);
    expect((await get(jwt({ iss: 'https://evil.example' }))).status).toBe(401);
    expect((await get(jwt({ exp: Math.floor(NOW / 1000) - 3600 }))).status).toBe(401);
    expect((await get(jwt({ repository: 'someone/Eat' }))).status).toBe(403);
    expect((await get(jwt({ ref: 'refs/heads/feature' }))).status).toBe(403);
    expect((await get(jwt({ event_name: 'pull_request' }))).status).toBe(403);
    expect(
      (await get(jwt({ job_workflow_ref: `${REPO}/.github/workflows/evil.yml@refs/heads/main` })))
        .status,
    ).toBe(403);
  });

  it('the backup job cannot write; only the restore job can', async () => {
    const d = deps();
    const sealed = seal(SECRET, 'creds/', { 'creds/a.json': 'x' }, 1);
    expect((await call(d, 'POST', '', jwt(), sealed)).status).toBe(403);
    expect((await call(d, 'GET', '?prefix=creds/', restoreJwt())).status).toBe(403);
    expect((await call(d, 'POST', '', restoreJwt(), sealed)).status).toBe(200);
  });
});

describe('backup and restore', () => {
  it('gives only the allowed folders, never counters or everything', async () => {
    const d = deps();
    await d.store.put('creds/a.json', 'C');
    await d.store.put('users/ab.json', 'U');
    await d.store.put('attempts/x.json', 'A');
    expect((await call(d, 'GET', '?prefix=attempts/')).status).toBe(400);
    expect((await call(d, 'GET', '')).status).toBe(400);
    const res = await call(d, 'GET', '?prefix=users/a');
    expect(open(SECRET, (await res.json()) as Sealed)).toEqual({ 'users/ab.json': 'U' });
  });

  it('restores through the server into an empty storage', async () => {
    const old = deps();
    await old.store.put('creds/a.json', '{"hash":"h"}');
    await old.store.put('meta/a.json', '{"login":"ivan"}');
    const parts = [
      (await (await call(old, 'GET', '?prefix=creds/')).json()) as Sealed,
      (await (await call(old, 'GET', '?prefix=meta/')).json()) as Sealed,
    ];
    const fresh = memory();
    const d = deps(SECRET, fresh);
    for (const p of parts) expect((await call(d, 'POST', '', restoreJwt(), p)).status).toBe(200);
    expect(fresh.data.get('creds/a.json')).toBe('{"hash":"h"}');
    expect(fresh.data.get('meta/a.json')).toBe('{"login":"ivan"}');
  });

  it('a backup from another AUTH_SECRET is refused and writes nothing; foreign paths are skipped', async () => {
    const foreign = seal('z'.repeat(40), 'creds/', { 'creds/a.json': 'x' }, 1);
    const fresh = memory();
    const d = deps(SECRET, fresh);
    expect((await call(d, 'POST', '', restoreJwt(), foreign)).status).toBe(422);
    expect(fresh.data.size).toBe(0);
    const sneaky = seal(
      SECRET,
      'creds/',
      { 'attempts/x.json': 'a', 'creds/../x': 'b', 'creds/ok.json': 'c' },
      1,
    );
    const res = await call(d, 'POST', '', restoreJwt(), sneaky);
    expect(((await res.json()) as { written: number }).written).toBe(1);
    expect([...fresh.data.keys()]).toEqual(['creds/ok.json']);
  });
});

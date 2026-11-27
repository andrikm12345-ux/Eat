import { afterEach, describe, expect, it } from 'vitest';
import { checkSecret, hashSecret, needsRehash, setScryptCost, userIdFor } from './auth.js';
import { login, register } from './handlers.js';
import type { Deps, Store } from './types.js';

const SECRET = 'x'.repeat(40);
const memoryStore = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
};
const deps = (store: Store): Deps => ({
  secret: SECRET,
  store,
  now: () => Date.UTC(2026, 10, 27, 12),
  signupOpen: true,
});
const post = (body: unknown) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

afterEach(() => setScryptCost(undefined));

describe('configurable password hashing cost (for hosts that cap CPU time)', () => {
  it('the default hash has no cost marker, a cheaper one remembers its cost', async () => {
    const full = await hashSecret('correct horse');
    expect(full.n).toBeUndefined();
    setScryptCost(4096);
    const cheap = await hashSecret('correct horse');
    expect(cheap.n).toBe(4096);
    expect(needsRehash(full)).toBe(true);
    expect(needsRehash(cheap)).toBe(false);
  });

  it('each hash is checked with its own cost, whatever the current one is', async () => {
    const full = await hashSecret('correct horse');
    setScryptCost(2048);
    const cheap = await hashSecret('battery staple');
    expect(await checkSecret(full, 'correct horse')).toBe(true);
    expect(await checkSecret(full, 'wrong')).toBe(false);
    setScryptCost(undefined);
    expect(await checkSecret(cheap, 'battery staple')).toBe(true);
    expect(await checkSecret(cheap, 'wrong')).toBe(false);
  });

  it('an invalid cost keeps the full one (a typo cannot weaken the hashes)', async () => {
    for (const bad of [0, 1, 500, 5000, 32768, -4096, 1.5, Number.NaN]) {
      setScryptCost(bad);
      expect((await hashSecret('pw-12345678')).n).toBeUndefined();
    }
  });

  it('sign-in on a host with another cost renews the hash and the account keeps working', async () => {
    const store = memoryStore();
    const d = deps(store);
    expect((await register(d, post({ login: 'moved', password: 'pass-12345' }))).status).toBe(200);
    const path = `creds/${userIdFor(SECRET, 'moved')}.json`;
    const before = JSON.parse(store.data.get(path) as string);
    expect(before.n).toBeUndefined();
    // The host now uses a cheaper cost: the first sign-in works with the old hash and renews it.
    setScryptCost(4096);
    expect((await login(d, post({ login: 'moved', password: 'pass-12345' }))).status).toBe(200);
    const after = JSON.parse(store.data.get(path) as string);
    expect(after.n).toBe(4096);
    expect(after.hash).not.toBe(before.hash);
    expect(after.recovery).toEqual(before.recovery);
    expect((await login(d, post({ login: 'moved', password: 'pass-12345' }))).status).toBe(200);
    expect((await login(d, post({ login: 'moved', password: 'wrong-pass-1' }))).status).toBe(401);
    // And back to the full cost: renewed again, nothing breaks.
    setScryptCost(undefined);
    expect((await login(d, post({ login: 'moved', password: 'pass-12345' }))).status).toBe(200);
    expect(JSON.parse(store.data.get(path) as string).n).toBeUndefined();
  });
});

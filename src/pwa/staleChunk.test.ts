import { describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, loadScreen } from './staleChunk';

const stale = () => new TypeError('Importing a module script failed.');
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('stale screen file after an update', () => {
  it("recognises the browsers' messages", () => {
    expect(isStaleChunkError(stale())).toBe(true);
    expect(
      isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /a.js')),
    ).toBe(true);
    expect(isStaleChunkError(new Error('boom'))).toBe(false);
  });

  it('returns the screen when it loads', async () => {
    const update = vi.fn(async () => {});
    expect(await loadScreen(async () => 7, { now: () => 1, storage: mem(), update })).toBe(7);
    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes once, then passes a repeated failure on', async () => {
    const update = vi.fn(async () => {});
    const storage = mem();
    const env = { now: () => 100_000, storage, update };
    void loadScreen(() => Promise.reject(stale()), env); // never settles: the page reloads
    await new Promise((r) => setTimeout(r, 0));
    expect(update).toHaveBeenCalledTimes(1);
    await expect(
      loadScreen(() => Promise.reject(stale()), { ...env, now: () => 110_000 }),
    ).rejects.toThrow();
    expect(update).toHaveBeenCalledTimes(1);
    // a minute later it may try again
    void loadScreen(() => Promise.reject(stale()), { ...env, now: () => 200_000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('other errors are not swallowed', async () => {
    await expect(
      loadScreen(() => Promise.reject(new Error('real bug')), {
        now: () => 1,
        storage: mem(),
        update: async () => {},
      }),
    ).rejects.toThrow('real bug');
  });
});

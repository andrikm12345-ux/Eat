import { describe, expect, it, vi } from 'vitest';
import { crackers, kefir, missing } from '../domain/__fixtures__/off';
import { repos } from '../db/repos';
import { fetchOff, lookupBarcode, offUrl } from './off';

const json = (body: unknown, status = 200) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );

describe('OFF client', () => {
  it('builds the v2 URL', () => {
    expect(offUrl('46070')).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/46070\.json\?fields=/,
    );
  });

  it('found / not found / http error', async () => {
    expect((await fetchOff('1', { fetchImpl: json(kefir), online: true })).kind).toBe('found');
    expect((await fetchOff('1', { fetchImpl: json(missing), online: true })).kind).toBe('notFound');
    expect((await fetchOff('1', { fetchImpl: json(missing, 404), online: true })).kind).toBe(
      'notFound',
    );
    expect(await fetchOff('1', { fetchImpl: json({}, 500), online: true })).toEqual({
      kind: 'error',
      message: 'HTTP 500',
    });
  });

  it('offline without calling the network', async () => {
    const f = json(kefir);
    expect(await fetchOff('1', { fetchImpl: f, online: false })).toEqual({ kind: 'offline' });
    expect(f).not.toHaveBeenCalled();
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchOff('1', { fetchImpl: failing, online: true })).toEqual({ kind: 'offline' });
  });

  it('times out after the limit', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    expect(
      await fetchOff('1', {
        fetchImpl: hanging as unknown as typeof fetch,
        timeoutMs: 20,
        online: true,
      }),
    ).toEqual({
      kind: 'error',
      message: 'timeout',
    });
  });

  it('caches OFF products and prefers the local cache next time', async () => {
    const f = json(crackers);
    const first = await lookupBarcode(repos, '777', { fetchImpl: f, online: true });
    expect(first.kind).toBe('off');
    if (first.kind === 'off')
      expect(first.food).toMatchObject({ barcode: '777', source: 'off', verified: false });
    const second = await lookupBarcode(repos, '777', { fetchImpl: f, online: true });
    expect(second.kind).toBe('local');
    expect(f).toHaveBeenCalledTimes(1);
    expect(
      (await lookupBarcode(repos, '000', { fetchImpl: json(missing), online: true })).kind,
    ).toBe('notFound');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { crackers, kefir, missing } from '../domain/__fixtures__/off';
import { repos } from '../db/repos';
import { cacheOffDraft, fetchOff, lookupBarcode, offSearchUrl, offUrl, searchOff } from './off';

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

describe('OFF text search', () => {
  const products = {
    products: [
      {
        code: '1',
        product_name: 'Коктейль молочный - шоколад',
        brands: 'Чудо',
        countries_tags: ['en:georgia'],
        nutriments: {
          'energy-kcal_100g': 98,
          proteins_100g: 3.1,
          fat_100g: 3,
          carbohydrates_100g: 14.7,
        },
      },
      {
        code: '2',
        product_name: 'Коктейль молочный',
        brands: 'Чудо',
        countries_tags: ['en:russia'],
        nutriments: {
          'energy-kcal_100g': 72,
          proteins_100g: 2.9,
          fat_100g: 2,
          carbohydrates_100g: 10.6,
        },
      },
      { code: '3', product_name: 'Пустой', countries_tags: ['en:russia'], nutriments: {} },
      {
        code: '4',
        product_name: 'Коктейль молочный',
        brands: 'Чудо',
        countries_tags: ['en:russia'],
        nutriments: {
          'energy-kcal_100g': 72,
          proteins_100g: 2.9,
          fat_100g: 2,
          carbohydrates_100g: 10.6,
        },
      },
    ],
  };

  it('puts Russian products first, drops empty and duplicate ones', async () => {
    const r = await searchOff('чудо коктейль', { fetchImpl: json(products), online: true });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.drafts.map((d) => d.barcode)).toEqual(['2', '1']);
      expect(r.drafts[0]).toMatchObject({
        name: 'Коктейль молочный',
        brand: 'Чудо',
        per100g: { kcal: 72 },
      });
    }
    expect(offSearchUrl('чудо коктейль')).toContain('search_terms=%D1%87%D1%83%D0%B4%D0%BE');
    expect(await searchOff('x', { fetchImpl: json({}), online: true })).toEqual({
      kind: 'ok',
      drafts: [],
    });
  });

  it('offline, http error, timeout', async () => {
    expect(await searchOff('x', { online: false })).toEqual({ kind: 'offline' });
    expect(await searchOff('x', { fetchImpl: json({}, 503), online: true })).toEqual({
      kind: 'error',
      message: 'HTTP 503',
    });
    const failing = vi.fn(async () => {
      throw new TypeError('x');
    });
    expect(await searchOff('x', { fetchImpl: failing, online: true })).toEqual({ kind: 'offline' });
    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new Error('a'))),
        ),
    );
    expect(
      await searchOff('x', {
        fetchImpl: hang as unknown as typeof fetch,
        timeoutMs: 20,
        online: true,
      }),
    ).toEqual({ kind: 'error', message: 'timeout' });
  });

  it('caches a result once per barcode', async () => {
    const r = await searchOff('x', { fetchImpl: json(products), online: true });
    if (r.kind !== 'ok') throw new Error('x');
    const a = await cacheOffDraft(repos, r.drafts[0]!);
    const b = await cacheOffDraft(repos, r.drafts[0]!);
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ source: 'off', verified: false, barcode: '2' });
    const noCode = await cacheOffDraft(repos, {
      name: 'Без кода',
      per100g: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
      servings: [],
    });
    expect(noCode.barcode).toBeUndefined();
  });
});

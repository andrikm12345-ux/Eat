import { describe, expect, it, vi } from 'vitest';
import { crackers, kefir, missing } from '../domain/__fixtures__/off';
import { repos } from '../db/repos';
import {
  attachBarcode,
  cacheOffDraft,
  fetchOff,
  lookupBarcode,
  offFastSearchUrl,
  offSearchUrl,
  offUrl,
  searchOff,
} from './off';

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
    // A failing request is retried once, then reported as an error (not as "no network").
    expect(await fetchOff('1', { fetchImpl: failing, online: true, retryDelayMs: 1 })).toEqual({
      kind: 'error',
      message: 'network',
    });
    expect(failing).toHaveBeenCalledTimes(2);
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
    expect(offFastSearchUrl('чудо коктейль')).toContain('q=%D1%87%D1%83%D0%B4%D0%BE');
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
    expect(await searchOff('x', { fetchImpl: failing, online: true, retryDelayMs: 1 })).toEqual({
      kind: 'error',
      message: 'network',
    });
    // One dropped request is recovered by the automatic retry.
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(
        async () => new Response(JSON.stringify({ products: [] }), { status: 200 }),
      );
    expect(
      await searchOff('x', {
        fetchImpl: flaky as unknown as typeof fetch,
        online: true,
        retryDelayMs: 1,
      }),
    ).toEqual({ kind: 'ok', drafts: [] });
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

  it('uses the fast service first, with brands as a list, and the old one when it fails', async () => {
    const hit = {
      code: '7',
      product_name: 'Творог',
      brands: ['xx:ПРОСТОКВАШИНО'],
      nutriments: {
        'energy-kcal_100g': 134,
        proteins_100g: 10.8,
        fat_100g: 4,
        carbohydrates_100g: 13.8,
      },
    };
    const urls: string[] = [];
    const fast = vi.fn(async (u: string) => {
      urls.push(u);
      return Response.json({ hits: [hit] });
    });
    const r = await searchOff('творог', {
      fetchImpl: fast as unknown as typeof fetch,
      online: true,
    });
    expect(r.kind === 'ok' && r.drafts[0]).toMatchObject({
      name: 'Творог',
      brand: 'ПРОСТОКВАШИНО',
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('search.openfoodfacts.org');
    // The fast service is down: the old one answers.
    const calls: string[] = [];
    const mixed = vi.fn(async (u: string) => {
      calls.push(u);
      return u.includes('search.openfoodfacts.org')
        ? new Response('x', { status: 503 })
        : Response.json({ products: [{ ...hit, brands: 'Простоквашино' }] });
    });
    const r2 = await searchOff('творог', {
      fetchImpl: mixed as unknown as typeof fetch,
      online: true,
    });
    expect(r2.kind === 'ok' && r2.drafts).toHaveLength(1);
    expect(calls).toHaveLength(2);
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

describe('attachBarcode', () => {
  it('binds to a food without a barcode, keeps one that matches, copies one with another code', async () => {
    const f = await repos.foods.add({
      name: 'Чудо',
      per100g: { kcal: 72, protein: 3, fat: 2, carbs: 10 },
      servings: [{ label: 'пачка', grams: 200 }],
      source: 'off',
      verified: false,
    });
    const bound = await attachBarcode(repos, f, '4610282720266');
    expect(bound).toMatchObject({ id: f.id, barcode: '4610282720266' });
    expect((await repos.foods.byBarcode('4610282720266'))?.id).toBe(f.id);
    expect((await attachBarcode(repos, bound, '4610282720266')).id).toBe(f.id);
    const copy = await attachBarcode(repos, bound, '4600000000001');
    expect(copy.id).not.toBe(f.id);
    expect(copy).toMatchObject({
      name: 'Чудо',
      barcode: '4600000000001',
      servings: [{ label: 'пачка', grams: 200 }],
      useCount: 0,
    });
  });
});

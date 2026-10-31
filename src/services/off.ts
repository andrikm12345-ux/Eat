import { mapOffProduct, type FoodDraft, type OffResponse } from '../domain/off';
import type { Food } from '../domain/types';
import type { Repos } from '../db/repos';

export const OFF_TIMEOUT_MS = 8000;
const FIELDS = [
  'code',
  'product_name',
  'product_name_ru',
  'generic_name',
  'generic_name_ru',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',');

export type OffLookup =
  | { kind: 'found'; draft: FoodDraft; raw: OffResponse }
  | { kind: 'notFound' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export const offUrl = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;

/** Fetches a product from Open Food Facts with an 8 s timeout. Never throws. */
export async function fetchOff(
  code: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; online?: boolean } = {},
): Promise<OffLookup> {
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (!online) return { kind: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? OFF_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(offUrl(code), {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { kind: 'notFound' };
    if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` };
    const raw = (await res.json()) as OffResponse;
    const draft = mapOffProduct(raw, code);
    return draft ? { kind: 'found', draft, raw } : { kind: 'notFound' };
  } catch {
    if (ctrl.signal.aborted) return { kind: 'error', message: 'timeout' };
    // fetch rejects with TypeError on network failure.
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Local cache first, then OFF; OFF products are cached as unverified foods. */
export async function lookupBarcode(
  r: Repos,
  code: string,
  opts: Parameters<typeof fetchOff>[1] = {},
): Promise<
  | { kind: 'local'; food: Food }
  | { kind: 'off'; food: Food }
  | Exclude<OffLookup, { kind: 'found' }>
> {
  const local = await r.foods.byBarcode(code);
  if (local) return { kind: 'local', food: local };
  const res = await fetchOff(code, opts);
  if (res.kind !== 'found') return res;
  const food = await r.foods.add({
    ...res.draft,
    source: 'off',
    verified: false,
    offRaw: res.raw as object,
  });
  return { kind: 'off', food };
}

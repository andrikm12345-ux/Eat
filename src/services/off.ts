import { mapOffProduct, type FoodDraft, type OffProduct, type OffResponse } from '../domain/off';
import type { Food } from '../domain/types';
import type { Repos } from '../db/repos';

export const OFF_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 800;

/**
 * fetch with one automatic retry on a network failure (Open Food Facts sometimes drops or
 * rate-limits a request, which the browser reports as a bare "Failed to fetch").
 */
async function fetchRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  retryDelayMs: number,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    if (signal.aborted) throw e;
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return fetchImpl(url, init);
  }
}
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
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    online?: boolean;
    retryDelayMs?: number;
  } = {},
): Promise<OffLookup> {
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (!online) return { kind: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? OFF_TIMEOUT_MS);
  try {
    const res = await fetchRetry(
      opts.fetchImpl ?? fetch,
      offUrl(code),
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
      ctrl.signal,
      opts.retryDelayMs ?? RETRY_DELAY_MS,
    );
    if (res.status === 404) return { kind: 'notFound' };
    if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` };
    const raw = (await res.json()) as OffResponse;
    const draft = mapOffProduct(raw, code);
    return draft ? { kind: 'found', draft, raw } : { kind: 'notFound' };
  } catch {
    if (ctrl.signal.aborted) return { kind: 'error', message: 'timeout' };
    // fetch rejects with TypeError on network failure.
    return { kind: 'error', message: 'network' };
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

export const offSearchUrl = (q: string, limit = 24) =>
  `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS},countries_tags`;

export type OffSearchResult =
  { kind: 'ok'; drafts: FoodDraft[] } | { kind: 'offline' } | { kind: 'error'; message: string };

/** A product is usable when it reports energy or at least one macro. */
const hasNutrition = (d: FoodDraft) =>
  d.per100g.kcal > 0 || d.per100g.protein + d.per100g.fat + d.per100g.carbs > 0;

/**
 * The newer Open Food Facts search service: fast and steady, while the old `search.pl` often
 * answers "temporarily unavailable". Brands come as a list there.
 */
export const offFastSearchUrl = (q: string, limit = 24) =>
  `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${limit}&langs=ru&fields=${FIELDS},countries_tags`;

type SearchProduct = Omit<OffProduct, 'brands'> & {
  brands?: string | string[];
  countries_tags?: string[];
};

/** One search attempt against one service. `null` products: the answer was not a usable list. */
async function searchOnce(
  url: string,
  pick: (body: Record<string, unknown>) => SearchProduct[] | null,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; retryDelayMs?: number },
): Promise<{ kind: 'ok'; products: SearchProduct[] } | { kind: 'error'; message: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? OFF_TIMEOUT_MS * 2);
  try {
    const res = await fetchRetry(
      opts.fetchImpl ?? fetch,
      url,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
      ctrl.signal,
      opts.retryDelayMs ?? RETRY_DELAY_MS,
    );
    if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` };
    const products = pick((await res.json()) as Record<string, unknown>);
    return products ? { kind: 'ok', products } : { kind: 'error', message: 'format' };
  } catch {
    return { kind: 'error', message: ctrl.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

const brandText = (b: string | string[] | undefined): string | undefined =>
  (Array.isArray(b) ? b : [b])
    .map((x) => x?.replace(/^[a-z]{2}:/, '').trim())
    .find((x) => x)
    ?.toString();

/**
 * Text search in Open Food Facts (Russian products first). Tries the fast service first and the
 * old one when it fails. Never throws.
 */
export async function searchOff(
  q: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    online?: boolean;
    retryDelayMs?: number;
  } = {},
): Promise<OffSearchResult> {
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (!online) return { kind: 'offline' };
  let res = await searchOnce(
    offFastSearchUrl(q),
    (b) => (Array.isArray(b.hits) ? (b.hits as SearchProduct[]) : null),
    opts,
  );
  const firstError = res.kind === 'error' ? res.message : null;
  if (res.kind === 'error') {
    res = await searchOnce(
      offSearchUrl(q),
      (b) => (Array.isArray(b.products) ? (b.products as SearchProduct[]) : []),
      opts,
    );
  }
  if (res.kind === 'error') return { kind: 'error', message: firstError ?? res.message };
  const seen = new Set<string>();
  const ranked = res.products
    .map((p) => ({ p, ru: p.countries_tags?.includes('en:russia') ? 0 : 1 }))
    .sort((a, b) => a.ru - b.ru);
  const drafts: FoodDraft[] = [];
  for (const { p } of ranked) {
    const code = p.code ?? '';
    const brands = brandText(p.brands);
    const d = mapOffProduct(
      { status: 1, product: { ...p, ...(brands ? { brands } : {}) } as OffProduct },
      code,
    );
    if (!d || !hasNutrition(d) || seen.has(`${d.name}|${d.brand ?? ''}|${d.per100g.kcal}`))
      continue;
    seen.add(`${d.name}|${d.brand ?? ''}|${d.per100g.kcal}`);
    drafts.push(d);
  }
  return { kind: 'ok', drafts };
}

/** Saves a search result as an (unverified) OFF food; reuses an existing one by barcode. */
export async function cacheOffDraft(r: Repos, d: FoodDraft): Promise<Food> {
  if (d.barcode) {
    const existing = await r.foods.byBarcode(d.barcode);
    if (existing) return existing;
  }
  return r.foods.add({ ...d, source: 'off', verified: false });
}

/**
 * Binds a scanned barcode to a food chosen by name, so the next scan finds it locally.
 * A food that already has another barcode is copied (different packages, same data).
 */
export async function attachBarcode(r: Repos, food: Food, code: string): Promise<Food> {
  if (food.barcode === code) return food;
  if (!food.barcode) return r.foods.edit(food.id, { barcode: code });
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    deletedAt: _d,
    searchKey: _s,
    useCount: _n,
    lastUsedAt: _l,
    ...rest
  } = food;
  return r.foods.add({ ...rest, barcode: code });
}

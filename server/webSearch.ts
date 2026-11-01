import { json, readJson } from './http.js';
import { session } from './sharedAi.js';
import type { Deps } from './types.js';

const ENDPOINT = 'https://api.tavily.com/search';
const MAX_QUERY = 300;
const MAX_RESULTS = 4;
const MAX_SNIPPET = 600;

export type SearchHit = { title: string; url: string; content: string };

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Counts one search for this user today; false when the daily limit is used up. */
async function takeQuota(d: Deps, userId: string, limit: number): Promise<boolean> {
  const path = `search-usage/${userId}/${dayOf(d.now())}.json`;
  const used = Number((JSON.parse((await d.store.get(path)) ?? '{}') as { n?: number }).n ?? 0);
  if (used >= limit) return false;
  await d.store.put(path, JSON.stringify({ n: used + 1 }));
  return true;
}

/** GET → whether web search is configured (the key itself is never returned). */
export async function searchStatus(d: Deps, req: Request): Promise<Response> {
  if (!(await session(d, req))) return json({ error: 'unauthorized' }, 401);
  return json({ available: !!d.search });
}

/**
 * POST {query} → {results: [{title, url, content}]} from a web search.
 * The key stays on the server; the caller must be signed in and has a daily limit.
 */
export async function webSearch(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!d.search) return json({ error: 'search_unavailable' }, 503);
  const body = await readJson(req);
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, MAX_QUERY) : '';
  if (query.length < 2) return json({ error: 'bad_request' }, 400);
  if (!s.admin && !(await takeQuota(d, s.userId, d.search.dailyLimit)))
    return json({ error: 'search_daily_limit', limit: d.search.dailyLimit }, 429);

  let upstream: Response;
  try {
    upstream = await (d.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${d.search.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: false,
      }),
    });
  } catch {
    return json({ error: 'search_upstream_unreachable' }, 502);
  }
  if (!upstream.ok) return json({ error: 'search_upstream_failed', status: upstream.status }, 502);
  let raw: { results?: unknown };
  try {
    raw = (await upstream.json()) as { results?: unknown };
  } catch {
    return json({ error: 'search_upstream_failed' }, 502);
  }
  const results: SearchHit[] = (Array.isArray(raw.results) ? raw.results : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.url === 'string' && typeof r.content === 'string')
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: String(r.title ?? '').slice(0, 160),
      url: String(r.url),
      content: String(r.content).slice(0, MAX_SNIPPET),
    }));
  return json({ results });
}

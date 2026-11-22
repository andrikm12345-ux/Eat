import type { Store } from './types.js';

/**
 * Key-value storage on Upstash Redis (REST API, plain fetch: no extra package). The Vercel
 * integration provides KV_REST_API_URL / KV_REST_API_TOKEN (Upstash's own names also work).
 *
 * One request carries at most about 1 MB on the free plan, so a bigger text (a long diary) is
 * stored in numbered pieces under the same path; the path itself then holds a short marker.
 */
const CHUNK = 700_000;
const MARK = '\u0001chunks:';

type Cmd = (string | number)[];

export type RedisConfig = { url: string; token: string; fetchImpl?: typeof fetch };

export function redisConfigFromEnv(env: NodeJS.ProcessEnv): RedisConfig | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function redisStore(cfg: RedisConfig): Store {
  const f = cfg.fetchImpl ?? fetch;
  const run = async <T>(cmd: Cmd): Promise<T> => {
    const res = await f(cfg.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || data.error) throw new Error(`redis: ${data.error ?? res.status}`);
    return data.result as T;
  };
  const piece = (path: string, i: number) => `${path}\u0001${i}`;

  const keys = async (prefix: string): Promise<string[]> => {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await run<[string, string[]]>([
        'SCAN',
        cursor,
        'MATCH',
        `${prefix.replace(/[*?[\]\\]/g, '\\$&')}*`,
        'COUNT',
        500,
      ]);
      out.push(...batch);
      cursor = next;
    } while (cursor !== '0');
    // Pieces are an implementation detail: callers see paths only.
    return [...new Set(out.filter((k) => !k.includes('\u0001')))];
  };

  return {
    async get(path) {
      const v = await run<string | null>(['GET', path]);
      if (v === null || v === undefined) return null;
      if (!v.startsWith(MARK)) return v;
      const n = Number(v.slice(MARK.length));
      const parts = await run<(string | null)[]>([
        'MGET',
        ...Array.from({ length: n }, (_, i) => piece(path, i)),
      ]);
      return parts.every((p) => typeof p === 'string') ? (parts as string[]).join('') : null;
    },
    async put(path, body) {
      if (body.length <= CHUNK) {
        await run(['SET', path, body]);
        return;
      }
      const n = Math.ceil(body.length / CHUNK);
      for (let i = 0; i < n; i++)
        await run(['SET', piece(path, i), body.slice(i * CHUNK, (i + 1) * CHUNK)]);
      // The marker goes last: a reader never sees a marker without its pieces.
      await run(['SET', path, `${MARK}${n}`]);
    },
    list: keys,
    async remove(prefix) {
      const all = await run<string[]>(['KEYS', `${prefix.replace(/[*?[\]\\]/g, '\\$&')}*`]);
      for (let i = 0; i < all.length; i += 100) await run(['DEL', ...all.slice(i, i + 100)]);
      return all.filter((k) => !k.includes('\u0001')).length;
    },
  };
}

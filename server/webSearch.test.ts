import { describe, expect, it } from 'vitest';
import { register } from './handlers.js';
import { searchStatus, webSearch } from './webSearch.js';
import type { Deps, Store } from './types.js';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const KEY = 'tvly-SECRET-KEY';

function memoryStore(): Store {
  const data = new Map<string, string>();
  return { get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
}

const hits = {
  results: [
    {
      title: 'Треугольник с курицей',
      url: 'https://shop.example/a',
      content: 'Калорийность 230 ккал',
    },
    { title: 'x', url: 'https://shop.example/b', content: 'y'.repeat(2000) },
    { title: 'bad', url: 5, content: 'no url' },
  ],
};

function setup(over: Partial<Deps> = {}, reply: () => Response = () => Response.json(hits)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const d: Deps = {
    secret: 's'.repeat(40),
    store: memoryStore(),
    now: () => T0,
    signupOpen: true,
    adminLogins: ['blackjack'],
    search: { apiKey: KEY, dailyLimit: 2 },
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return reply();
    }) as unknown as typeof fetch,
    ...over,
  };
  return { d, calls };
}

async function signUp(d: Deps, login: string) {
  const res = await register(
    d,
    new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ login, password: 'password-1' }),
    }),
  );
  return ((await res.json()) as { token: string }).token;
}

const post = (token: string | undefined, body: unknown) =>
  new Request('http://x', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('web search endpoint', () => {
  it('needs a signed-in user', async () => {
    const { d } = setup();
    expect((await webSearch(d, post(undefined, { query: 'сыр' }))).status).toBe(401);
    expect((await searchStatus(d, new Request('http://x'))).status).toBe(401);
  });

  it('is off without a key and says so in the status', async () => {
    const { d } = setup({ search: undefined });
    const t = await signUp(d, 'anna');
    expect((await webSearch(d, post(t, { query: 'сыр' }))).status).toBe(503);
    const st = await searchStatus(
      d,
      new Request('http://x', { headers: { authorization: `Bearer ${t}` } }),
    );
    expect(await st.json()).toEqual({ available: false });
  });

  it('returns trimmed results, keeps the key on the server and filters broken hits', async () => {
    const { d, calls } = setup();
    const t = await signUp(d, 'anna');
    const res = await webSearch(d, post(t, { query: 'Жар Свежар треугольник' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { url: string; content: string }[] };
    expect(body.results).toHaveLength(2);
    expect(body.results[1]?.content.length).toBe(600);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(calls[0]?.url).toBe('https://api.tavily.com/search');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      query: 'Жар Свежар треугольник',
      max_results: 4,
    });
  });

  it('rejects empty queries and bad bodies', async () => {
    const { d } = setup();
    const t = await signUp(d, 'anna');
    expect((await webSearch(d, post(t, { query: ' ' }))).status).toBe(400);
    expect((await webSearch(d, post(t, 'not json'))).status).toBe(400);
  });

  it('limits searches per user per day; the administrator is not limited', async () => {
    const { d } = setup();
    const t = await signUp(d, 'anna');
    const admin = await signUp(d, 'blackjack');
    expect((await webSearch(d, post(t, { query: 'один' }))).status).toBe(200);
    expect((await webSearch(d, post(t, { query: 'два' }))).status).toBe(200);
    const third = await webSearch(d, post(t, { query: 'три' }));
    expect(third.status).toBe(429);
    for (let i = 0; i < 4; i++)
      expect((await webSearch(d, post(admin, { query: `запрос ${i}` }))).status).toBe(200);
  });

  it('reports upstream problems without leaking details', async () => {
    const down = setup({}, () => new Response('nope', { status: 500 }));
    const t = await signUp(down.d, 'anna');
    expect((await webSearch(down.d, post(t, { query: 'сыр' }))).status).toBe(502);

    const broken = setup({}, () => new Response('<html>', { status: 200 }));
    const t2 = await signUp(broken.d, 'bob');
    expect((await webSearch(broken.d, post(t2, { query: 'сыр' }))).status).toBe(502);

    const unreachable = setup({
      fetchImpl: (async () => {
        throw new Error('network');
      }) as unknown as typeof fetch,
    });
    const t3 = await signUp(unreachable.d, 'carl');
    expect((await webSearch(unreachable.d, post(t3, { query: 'сыр' }))).status).toBe(502);
  });

  it('treats a reply without a results list as empty', async () => {
    const { d } = setup({}, () => Response.json({}));
    const t = await signUp(d, 'anna');
    expect(await (await webSearch(d, post(t, { query: 'сыр' }))).json()).toEqual({ results: [] });
  });
});

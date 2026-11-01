import { describe, expect, it, vi } from 'vitest';
import { register } from './handlers.js';
import { aiChat, aiConfigGet, aiConfigPut, aiStatus, MAX_AI_BYTES } from './sharedAi.js';
import type { Deps, Store } from './types.js';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
}

type Upstream = (url: string, init: RequestInit) => Promise<Response>;
const okReply = () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }));

function setup(over: Partial<Deps> = {}, upstream: Upstream = async () => okReply()) {
  let t = T0;
  const calls: { url: string; init: RequestInit }[] = [];
  const d: Deps = {
    secret: 's'.repeat(40),
    store: memoryStore(),
    now: () => t,
    signupOpen: true,
    adminLogins: ['blackjack'],
    ai: {
      apiKey: 'thk_live_SECRET_KEY',
      baseUrl: 'https://ai.example.com/v1/',
      modelText: 'text-model',
      modelVision: 'vision-model',
      dailyLimit: 3,
    },
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return upstream(url, init);
    }) as unknown as typeof fetch,
    ...over,
  };
  return { d, calls, advance: (ms: number) => (t += ms) };
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

const get = (token?: string) =>
  new Request('http://x', { headers: token ? { authorization: `Bearer ${token}` } : {} });
const post = (token: string | undefined, body: unknown, raw = false) =>
  new Request('http://x', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: raw ? (body as string) : JSON.stringify(body),
  });
const msgs = { vision: false, messages: [{ role: 'user', content: 'hi' }] };

describe('shared AI status', () => {
  it('needs a session and tells availability and the admin flag', async () => {
    const { d } = setup();
    expect((await aiStatus(d, get())).status).toBe(401);
    expect((await aiStatus(d, get('bad.token'))).status).toBe(401);
    const user = await signUp(d, 'ivan');
    const admin = await signUp(d, 'Blackjack');
    expect(await (await aiStatus(d, get(user))).json()).toEqual({ available: true, admin: false });
    expect(await (await aiStatus(d, get(admin))).json()).toEqual({ available: true, admin: true });
  });

  it('is unavailable without a key or when not configured at all', async () => {
    const noKey = setup({
      ai: { baseUrl: 'https://a/v1', modelText: 'm', modelVision: 'v', dailyLimit: 5 },
    });
    const t1 = await signUp(noKey.d, 'ivan');
    expect(await (await aiStatus(noKey.d, get(t1))).json()).toMatchObject({ available: false });
    const off = setup();
    delete off.d.ai;
    const t2 = await signUp(off.d, 'ivan');
    expect(await (await aiStatus(off.d, get(t2))).json()).toMatchObject({ available: false });
    expect((await aiChat(off.d, post(t2, msgs))).status).toBe(503);
    expect((await aiConfigGet(off.d, get(t2))).status).toBe(403);
  });
});

describe('shared AI chat', () => {
  it('forwards with the server key and model, and never leaks the key', async () => {
    const { d, calls } = setup();
    const token = await signUp(d, 'ivan');
    const res = await aiChat(d, post(token, { ...msgs, max_tokens: 99999 }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('SECRET_KEY');
    expect(JSON.parse(text).choices[0].message.content).toBe('hi');
    expect(calls[0]!.url).toBe('https://ai.example.com/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer thk_live_SECRET_KEY',
    );
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent).toMatchObject({ model: 'text-model', max_tokens: 8000 });
    // Photos use the vision model.
    await aiChat(d, post(token, { ...msgs, vision: true }));
    expect(JSON.parse(calls[1]!.init.body as string).model).toBe('vision-model');
  });

  it('rejects anonymous, malformed and oversized requests', async () => {
    const { d, calls } = setup();
    const token = await signUp(d, 'ivan');
    expect((await aiChat(d, post(undefined, msgs))).status).toBe(401);
    expect((await aiChat(d, post(token, 'not json', true))).status).toBe(400);
    expect((await aiChat(d, post(token, { messages: [] }))).status).toBe(400);
    expect((await aiChat(d, post(token, { vision: false }))).status).toBe(400);
    expect((await aiChat(d, post(token, 'x'.repeat(MAX_AI_BYTES + 1), true))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('passes the service errors through (balance, images) and reports an unreachable service', async () => {
    const paid = setup(
      {},
      async () => new Response('{"error":{"type":"insufficient_balance"}}', { status: 402 }),
    );
    const t1 = await signUp(paid.d, 'ivan');
    const r = await aiChat(paid.d, post(t1, msgs));
    expect(r.status).toBe(402);
    expect(await r.text()).toContain('insufficient_balance');
    const down = setup({}, async () => {
      throw new TypeError('network');
    });
    const t2 = await signUp(down.d, 'ivan');
    expect(await (await aiChat(down.d, post(t2, msgs))).json()).toEqual({
      error: 'ai_upstream_unreachable',
    });
  });

  it('limits each user per day; administrators are exempt; the next day resets', async () => {
    const { d, calls, advance } = setup();
    const user = await signUp(d, 'ivan');
    const other = await signUp(d, 'petr');
    const admin = await signUp(d, 'blackjack');
    for (let i = 0; i < 3; i++) expect((await aiChat(d, post(user, msgs))).status).toBe(200);
    const blocked = await aiChat(d, post(user, msgs));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'ai_daily_limit', limit: 3 });
    expect(calls).toHaveLength(3);
    expect((await aiChat(d, post(other, msgs))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await aiChat(d, post(admin, msgs))).status).toBe(200);
    advance(24 * 3600 * 1000);
    expect((await aiChat(d, post(user, msgs))).status).toBe(200);
  });
});

describe('shared AI settings (administrator)', () => {
  it('only an administrator can read or change them; the key is never returned', async () => {
    const { d } = setup();
    const user = await signUp(d, 'ivan');
    const admin = await signUp(d, 'blackjack');
    expect((await aiConfigGet(d, get())).status).toBe(401);
    expect((await aiConfigGet(d, get(user))).status).toBe(403);
    expect((await aiConfigPut(d, post(user, { modelText: 'x' }))).status).toBe(403);
    expect((await aiConfigPut(d, post(undefined, { modelText: 'x' }))).status).toBe(401);
    const res = await aiConfigGet(d, get(admin));
    const text = await res.text();
    expect(text).not.toContain('SECRET_KEY');
    expect(JSON.parse(text)).toEqual({
      enabled: true,
      baseUrl: 'https://ai.example.com/v1/',
      modelText: 'text-model',
      modelVision: 'vision-model',
      dailyLimit: 3,
      keySet: true,
    });
  });

  it('saved changes apply to everyone; disabling switches the shared AI off', async () => {
    const { d, calls } = setup();
    const user = await signUp(d, 'ivan');
    const admin = await signUp(d, 'blackjack');
    const saved = await aiConfigPut(
      d,
      post(admin, {
        modelText: ' new-text ',
        modelVision: 'new-vision',
        baseUrl: 'https://other.example.com/v1',
        junk: 1,
      }),
    );
    expect(await saved.json()).toMatchObject({
      modelText: 'new-text',
      modelVision: 'new-vision',
      baseUrl: 'https://other.example.com/v1',
    });
    await aiChat(d, post(user, msgs));
    expect(calls[0]!.url).toBe('https://other.example.com/v1/chat/completions');
    expect(JSON.parse(calls[0]!.init.body as string).model).toBe('new-text');

    await aiConfigPut(d, post(admin, { enabled: false }));
    expect(await (await aiStatus(d, get(user))).json()).toMatchObject({ available: false });
    expect((await aiChat(d, post(user, msgs))).status).toBe(503);
    await aiConfigPut(d, post(admin, { enabled: true }));
    expect(await (await aiStatus(d, get(user))).json()).toMatchObject({ available: true });
  });

  it('validates input', async () => {
    const { d } = setup();
    const admin = await signUp(d, 'blackjack');
    expect(
      (await aiConfigPut(d, post(admin, { baseUrl: 'http://insecure.example.com' }))).status,
    ).toBe(400);
    expect((await aiConfigPut(d, post(admin, 'nope', true))).status).toBe(400);
    // Broken stored settings fall back to the defaults.
    (d.store as ReturnType<typeof memoryStore>).data.set('config/ai.json', 'not json');
    expect((await aiConfigGet(d, get(admin))).status).toBe(200);
    (d.store as ReturnType<typeof memoryStore>).data.set('config/ai.json', '"string"');
    expect((await aiConfigGet(d, get(admin))).status).toBe(200);
  });
});

describe('wiring', () => {
  it('reads the environment', async () => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(40));
    vi.stubEnv('AI_API_KEY', ' k ');
    vi.stubEnv('ADMIN_LOGINS', ' Blackjack , ');
    vi.stubEnv('AI_DAILY_LIMIT', '7');
    const { envDeps } = await import('./deps.js');
    const d = envDeps();
    expect(d.adminLogins).toEqual(['blackjack']);
    expect(d.ai).toMatchObject({
      apiKey: 'k',
      dailyLimit: 7,
      baseUrl: 'https://tokenharbor.ai/v1',
    });
    vi.unstubAllEnvs();
  });
});

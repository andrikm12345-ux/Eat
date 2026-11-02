import { userIdFor } from './auth.js';
import { userOf } from './handlers.js';
import { json, readJson } from './http.js';
import type { Deps, SharedAiEnv } from './types.js';

export const MAX_AI_BYTES = 4 * 1024 * 1024;
const CONFIG_PATH = 'config/ai.json';

/** Administrator-editable overrides stored next to the environment defaults. */
type Overrides = { enabled?: boolean; baseUrl?: string; modelText?: string; modelVision?: string };

export type EffectiveAi = SharedAiEnv & { enabled: boolean };

async function readOverrides(d: Deps): Promise<Overrides> {
  const text = await d.store.get(CONFIG_PATH);
  if (!text) return {};
  try {
    const v = JSON.parse(text) as Overrides;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

async function effective(d: Deps): Promise<EffectiveAi | null> {
  if (!d.ai) return null;
  const o = await readOverrides(d);
  return {
    ...d.ai,
    baseUrl: o.baseUrl || d.ai.baseUrl,
    modelText: o.modelText || d.ai.modelText,
    modelVision: o.modelVision || d.ai.modelVision,
    enabled: o.enabled ?? true,
  };
}

const available = (e: EffectiveAi | null): e is EffectiveAi & { apiKey: string } =>
  !!e && e.enabled && !!e.apiKey;

export async function session(
  d: Deps,
  req: Request,
): Promise<{ userId: string; admin: boolean } | null> {
  const userId = await userOf(d, req);
  if (!userId) return null;
  const admin = (d.adminLogins ?? []).some((l) => userIdFor(d.secret, l) === userId);
  return { userId, admin };
}

/** GET → whether the shared AI can be used by this user, and whether they administer it. */
export async function aiStatus(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  return json({ available: available(await effective(d)), admin: s.admin });
}

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Counts one request for this user today; false when the daily limit is used up. */
async function takeQuota(d: Deps, userId: string, limit: number): Promise<boolean> {
  const path = `usage/${userId}/${dayOf(d.now())}.json`;
  const used = Number((JSON.parse((await d.store.get(path)) ?? '{}') as { n?: number }).n ?? 0);
  if (used >= limit) return false;
  await d.store.put(path, JSON.stringify({ n: used + 1 }));
  return true;
}

/**
 * POST {vision, messages (OpenAI shape, system first), max_tokens?} → the AI service's reply.
 * The key and the model come from the server; the caller only needs to be signed in.
 */
export async function aiChat(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const cfg = await effective(d);
  if (!available(cfg)) return json({ error: 'ai_unavailable' }, 503);

  const text = await req.text();
  if (text.length > MAX_AI_BYTES) return json({ error: 'too_large' }, 413);
  let body: Record<string, unknown> | null;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0)
    return json({ error: 'bad_request' }, 400);

  if (!s.admin && !(await takeQuota(d, s.userId, cfg.dailyLimit)))
    return json({ error: 'ai_daily_limit', limit: cfg.dailyLimit }, 429);

  const model = body.vision ? cfg.modelVision : cfg.modelText;
  const started = d.now();
  const note = (what: string, status?: number) =>
    // Timing for the administrator's logs: model, size of the request, how long it took. No key, no text.
    console.log(
      `ai upstream ${what}`,
      JSON.stringify({
        model,
        vision: !!body.vision,
        chars: JSON.stringify(body.messages).length,
        status,
        ms: d.now() - started,
      }),
    );
  let upstream: Response;
  let answer: string;
  try {
    upstream = await (d.fetchImpl ?? fetch)(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: body.messages,
        max_tokens: Math.min(Number(body.max_tokens) || 4000, 8000),
      }),
      // Answer before the platform kills the function, so the app gets a clean error.
      // The limit covers reading the answer too, which is where a slow model usually stalls.
      signal: AbortSignal.timeout(85_000),
    });
    answer = await upstream.text();
  } catch (e) {
    // A DOMException is not always an Error instance, so only the name is checked.
    const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
    note(timedOut ? 'timeout' : 'unreachable');
    return timedOut
      ? json({ error: 'ai_upstream_timeout' }, 504)
      : json({ error: 'ai_upstream_unreachable' }, 502);
  }
  note('done', upstream.status);
  // Pass the service's status and body through: the client already understands them
  // (402 balance, 429 limits, 400 images not supported…). The key never appears in them.
  return new Response(answer, {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** GET (administrator) → the current shared settings; the key itself is never returned. */
export async function aiConfigGet(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!s.admin) return json({ error: 'forbidden' }, 403);
  const e = await effective(d);
  if (!e) return json({ error: 'ai_unavailable' }, 503);
  return json({
    enabled: e.enabled,
    baseUrl: e.baseUrl,
    modelText: e.modelText,
    modelVision: e.modelVision,
    dailyLimit: e.dailyLimit,
    keySet: !!e.apiKey,
  });
}

/** PUT (administrator) {enabled?, baseUrl?, modelText?, modelVision?} → saves the overrides. */
export async function aiConfigPut(d: Deps, req: Request): Promise<Response> {
  const s = await session(d, req);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!s.admin) return json({ error: 'forbidden' }, 403);
  const body = await readJson(req);
  if (!body) return json({ error: 'bad_request' }, 400);
  const next: Overrides = {};
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  for (const k of ['baseUrl', 'modelText', 'modelVision'] as const) {
    const v = body[k];
    if (typeof v === 'string' && v.trim()) next[k] = v.trim();
  }
  if (next.baseUrl && !/^https:\/\//i.test(next.baseUrl))
    return json({ error: 'bad_base_url' }, 400);
  await d.store.put(CONFIG_PATH, JSON.stringify({ ...(await readOverrides(d)), ...next }));
  return aiConfigGet(d, req);
}

// Minimal Claude Messages API client for the browser (no backend; key stays local).

export const DEFAULT_BASE = 'https://api.anthropic.com';
export const API_URL = `${DEFAULT_BASE}/v1/messages`;
export const MODELS_URL = `${DEFAULT_BASE}/v1/models?limit=1`;

/** Accepts `https://host`, `https://host/` or `https://host/v1`; empty = Anthropic. */
export function normalizeBase(raw?: string): string {
  const b = (raw ?? '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  return b || DEFAULT_BASE;
}
export const isCustomBase = (raw?: string) => normalizeBase(raw) !== DEFAULT_BASE;
export const messagesUrl = (raw?: string) => `${normalizeBase(raw)}/v1/messages`;
export const modelsUrl = (raw?: string) => `${normalizeBase(raw)}/v1/models?limit=1`;
export const AI_TIMEOUT_MS = 45_000;

export type AiErrorKind =
  | 'noKey'
  | 'disabled'
  | 'noConsent'
  | 'offline'
  | 'timeout'
  | 'auth'
  | 'rate'
  | 'server'
  | 'badRequest'
  | 'refusal'
  | 'invalidJson'
  | 'empty';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };

export type Message = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

export type CallOptions = {
  apiKey: string;
  model: string;
  system: string;
  messages: Message[];
  maxTokens?: number;
  /** Address of an Anthropic-compatible API; empty = Anthropic. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Delay before the single retry (ms); doubled for each attempt. */
  retryDelayMs?: number;
};

export type CallResult = { text: string; raw: unknown; latencyMs: number };

const RETRYABLE = (s: number) => s === 429 || s === 408 || s >= 500;

/** Effort is only sent to model families that accept it (5.x). */
export const supportsEffort = (model: string) =>
  /^claude-(haiku|sonnet|opus|fable|mythos)-5/.test(model);

export function headers(apiKey: string, baseUrl?: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    // Other services often expect a bearer token instead of (or besides) x-api-key.
    ...(isCustomBase(baseUrl) ? { authorization: `Bearer ${apiKey}` } : {}),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

function errorFor(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', 'Ключ API не принят', status);
  if (status === 429)
    return new AiError('rate', 'Слишком много запросов к ИИ, попробуйте позже', status);
  if (status === 529 || status >= 500)
    return new AiError('server', 'Сервис ИИ перегружен или недоступен', status);
  return new AiError('badRequest', `Запрос отклонён (${status}): ${body.slice(0, 200)}`, status);
}

async function once(o: CallOptions): Promise<CallResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? AI_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const body = {
      model: o.model,
      max_tokens: o.maxTokens ?? 8000,
      system: o.system,
      messages: o.messages,
      ...(supportsEffort(o.model) ? { output_config: { effort: 'low' } } : {}),
    };
    let res: Response;
    try {
      res = await (o.fetchImpl ?? fetch)(messagesUrl(o.baseUrl), {
        method: 'POST',
        headers: headers(o.apiKey, o.baseUrl),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      if (ctrl.signal.aborted) throw new AiError('timeout', 'ИИ не ответил за 45 секунд');
      throw new AiError('offline', 'Нет связи с сервисом ИИ');
    }
    if (!res.ok) throw errorFor(res.status, await res.text().catch(() => ''));
    const raw = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };
    if (raw.stop_reason === 'refusal')
      throw new AiError('refusal', 'ИИ отказался обрабатывать этот запрос');
    // Thinking blocks (adaptive thinking on 5.x models) are skipped; only text is used.
    const text = (raw.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new AiError('empty', 'ИИ вернул пустой ответ');
    return { text, raw, latencyMs: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}

/** One request with a single retry on 429/5xx/network errors (exponential delay). */
export async function callClaude(o: CallOptions): Promise<CallResult> {
  try {
    return await once(o);
  } catch (e) {
    const retry =
      e instanceof AiError &&
      (e.kind === 'rate' ||
        e.kind === 'server' ||
        e.kind === 'offline' ||
        (e.status !== undefined && RETRYABLE(e.status)));
    if (!retry) throw e;
    await new Promise((r) => setTimeout(r, o.retryDelayMs ?? 1500));
    return once(o);
  }
}

/** Cheap key check (lists one model). */
export async function checkKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl?: string,
): Promise<boolean> {
  try {
    const res = await fetchImpl(modelsUrl(baseUrl), { headers: headers(apiKey, baseUrl) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Model ids offered by the service (Anthropic and compatible APIs: `{data: [{id}]}`), or null. */
export async function listModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl?: string,
): Promise<string[] | null> {
  try {
    const res = await fetchImpl(`${normalizeBase(baseUrl)}/v1/models?limit=200`, {
      headers: headers(apiKey, baseUrl),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: unknown }[] };
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string');
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

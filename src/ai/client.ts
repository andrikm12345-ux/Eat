// Minimal Claude Messages API client for the browser (no backend; key stays local).

export const DEFAULT_BASE = 'https://api.anthropic.com';
export const API_URL = `${DEFAULT_BASE}/v1/messages`;
export const MODELS_URL = `${DEFAULT_BASE}/v1/models?limit=1`;

/** `anthropic` = Messages API; `openai` = Chat Completions (OpenRouter, Gemini, DeepSeek…). */
export type ApiFormat = 'anthropic' | 'openai';

/**
 * Anthropic: accepts `https://host`, `https://host/` or `https://host/v1`; empty = Anthropic.
 * OpenAI-compatible: the address as given (e.g. `https://openrouter.ai/api/v1`), no trailing slash.
 */
export function normalizeBase(raw?: string, format: ApiFormat = 'anthropic'): string {
  const b = (raw ?? '').trim().replace(/\/+$/, '');
  if (format === 'openai') return b;
  return b.replace(/\/v1$/, '') || DEFAULT_BASE;
}
export const isCustomBase = (raw?: string, format: ApiFormat = 'anthropic') =>
  format === 'openai' || normalizeBase(raw) !== DEFAULT_BASE;
export const messagesUrl = (raw?: string, format: ApiFormat = 'anthropic') =>
  format === 'openai'
    ? `${normalizeBase(raw, format)}/chat/completions`
    : `${normalizeBase(raw)}/v1/messages`;
export const modelsUrl = (raw?: string, format: ApiFormat = 'anthropic', limit = 1) =>
  format === 'openai'
    ? `${normalizeBase(raw, format)}/models`
    : `${normalizeBase(raw)}/v1/models?limit=${limit}`;
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
  format?: ApiFormat;
  /** Send through our server (shared AI) with this session token instead of using `apiKey`. */
  proxyToken?: string;
  /** Picks the vision model on the server in proxy mode. */
  vision?: boolean;
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

export function headers(
  apiKey: string,
  baseUrl?: string,
  format: ApiFormat = 'anthropic',
): Record<string, string> {
  if (format === 'openai') {
    return { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  }
  return {
    'x-api-key': apiKey,
    // Other services often expect a bearer token instead of (or besides) x-api-key.
    ...(isCustomBase(baseUrl) ? { authorization: `Bearer ${apiKey}` } : {}),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

type OpenAiPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/** Our Anthropic-shaped messages → Chat Completions messages (system first, images as data URLs). */
export function toOpenAiMessages(system: string, messages: Message[]) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((b): OpenAiPart =>
              b.type === 'text'
                ? { type: 'text', text: b.text }
                : {
                    type: 'image_url',
                    image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
                  },
            ),
    })),
  ];
}

function errorFor(status: number, body: string, proxy = false): AiError {
  if (proxy) {
    if (status === 401)
      return new AiError('auth', 'войдите в аккаунт заново — вход устарел', status);
    if (status === 429 && body.includes('ai_daily_limit'))
      return new AiError('rate', 'суточный лимит общего ИИ исчерпан, попробуйте завтра', status);
    if (status === 503 && body.includes('ai_unavailable'))
      return new AiError('server', 'общий ИИ сейчас выключен администратором', status);
  }
  if (status === 401 || status === 403) return new AiError('auth', 'Ключ API не принят', status);
  if (status === 402)
    return new AiError(
      'badRequest',
      'на балансе ИИ-сервиса недостаточно средств — пополните его или выберите бесплатную модель в «ИИ-настройках»',
      status,
    );
  if (status === 429)
    return new AiError('rate', 'Слишком много запросов к ИИ, попробуйте позже', status);
  if (status === 529 || status >= 500)
    return new AiError('server', 'Сервис ИИ перегружен или недоступен', status);
  if (
    status === 400 &&
    /image|multimodal|vision/i.test(body) &&
    /support|accept|multimodal/i.test(body)
  )
    return new AiError(
      'badRequest',
      'эта модель не понимает фото — выберите для фото другую (с поддержкой изображений) в «ИИ-настройках»',
      status,
    );
  return new AiError('badRequest', `Запрос отклонён (${status}): ${body.slice(0, 200)}`, status);
}

async function once(o: CallOptions): Promise<CallResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? AI_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const proxy = !!o.proxyToken;
    const format = proxy ? 'openai' : (o.format ?? 'anthropic');
    const body = proxy
      ? {
          vision: !!o.vision,
          max_tokens: o.maxTokens ?? 4000,
          messages: toOpenAiMessages(o.system, o.messages),
        }
      : format === 'openai'
        ? {
            model: o.model,
            max_tokens: o.maxTokens ?? 8000,
            messages: toOpenAiMessages(o.system, o.messages),
          }
        : {
            model: o.model,
            max_tokens: o.maxTokens ?? 8000,
            system: o.system,
            messages: o.messages,
            ...(supportsEffort(o.model) ? { output_config: { effort: 'low' } } : {}),
          };
    let res: Response;
    try {
      res = await (o.fetchImpl ?? fetch)(proxy ? '/api/ai/chat' : messagesUrl(o.baseUrl, format), {
        method: 'POST',
        headers: proxy
          ? { authorization: `Bearer ${o.proxyToken}`, 'content-type': 'application/json' }
          : headers(o.apiKey, o.baseUrl, format),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      if (ctrl.signal.aborted) throw new AiError('timeout', 'ИИ не ответил за 45 секунд');
      throw new AiError('offline', 'Нет связи с сервисом ИИ');
    }
    if (!res.ok) throw errorFor(res.status, await res.text().catch(() => ''), proxy);
    const raw = (await res.json()) as unknown;
    const text = format === 'openai' ? openAiText(raw) : anthropicText(raw);
    return { text, raw, latencyMs: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}

type AnthropicReply = { content?: { type: string; text?: string }[]; stop_reason?: string };

function anthropicText(raw: unknown): string {
  const r = raw as AnthropicReply;
  if (r.stop_reason === 'refusal')
    throw new AiError('refusal', 'ИИ отказался обрабатывать этот запрос');
  // Thinking blocks (adaptive thinking on 5.x models) are skipped; only text is used.
  const text = (r.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new AiError('empty', 'ИИ вернул пустой ответ');
  return text;
}

type OpenAiReply = {
  choices?: { finish_reason?: string; message?: { content?: unknown } }[];
};

function openAiText(raw: unknown): string {
  const choice = (raw as OpenAiReply).choices?.[0];
  if (choice?.finish_reason === 'content_filter')
    throw new AiError('refusal', 'ИИ отказался обрабатывать этот запрос');
  const c = choice?.message?.content;
  const text = (
    typeof c === 'string'
      ? c
      : Array.isArray(c)
        ? c
            .map((p) =>
              typeof (p as { text?: unknown }).text === 'string'
                ? (p as { text: string }).text
                : '',
            )
            .join('\n')
        : ''
  ).trim();
  if (!text) throw new AiError('empty', 'ИИ вернул пустой ответ');
  return text;
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
  format: ApiFormat = 'anthropic',
): Promise<boolean> {
  if (format === 'openai' && !normalizeBase(baseUrl, format)) return false;
  try {
    const res = await fetchImpl(modelsUrl(baseUrl, format), {
      headers: headers(apiKey, baseUrl, format),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ModelInfo = {
  id: string;
  /** Priced at zero (OpenRouter reports pricing; other services: unknown = false). */
  free: boolean;
  /** Accepts images, when the service says so (OpenRouter); null = unknown. */
  vision: boolean | null;
};

type RawModel = {
  id?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { input_modalities?: unknown };
};

const isZero = (v: unknown) => v === '0' || v === 0 || v === '0.0';

/** Models offered by the service (`{data: [{id, pricing?, architecture?}]}`), or null. */
export async function listModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl?: string,
  format: ApiFormat = 'anthropic',
): Promise<ModelInfo[] | null> {
  if (format === 'openai' && !normalizeBase(baseUrl, format)) return null;
  try {
    const res = await fetchImpl(modelsUrl(baseUrl, format, 200), {
      headers: headers(apiKey, baseUrl, format),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: RawModel[] };
    const out: ModelInfo[] = [];
    for (const m of body.data ?? []) {
      if (typeof m.id !== 'string') continue;
      const mods = m.architecture?.input_modalities;
      out.push({
        // Google lists ids as "models/gemini-…" but expects the bare name in requests.
        id: m.id.replace(/^models\//, ''),
        free:
          m.id.endsWith(':free') || (isZero(m.pricing?.prompt) && isZero(m.pricing?.completion)),
        vision: Array.isArray(mods) ? mods.includes('image') : null,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

import type { AiRun } from '../domain/types';
import type { Repos } from '../db/repos';
import { AiError, callClaude, type ContentBlock, type Message } from './client';
import { extractFirstJson } from './json';
import { retryMessage } from './prompts';
import { getSession } from '../services/account';
import { aiReady, getAiConfig } from './settings';
import type { Valid } from './validators';
import { reportError } from '../services/errorReport';

export type RunOptions<T> = {
  kind: AiRun['kind'];
  vision: boolean;
  system: string;
  content: ContentBlock[];
  validate: (data: unknown) => Valid<T>;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  timeoutMs?: number;
};

/** Request copy for the log: images replaced by size placeholders, never the key. */
function logRequest(model: string, system: string, messages: Message[]) {
  return {
    model,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((b) =>
              b.type === 'image'
                ? { type: 'image', bytes: Math.round((b.source.data.length * 3) / 4) }
                : b,
            ),
    })),
  };
}

/**
 * Runs an AI feature: checks settings/consent, calls Claude, extracts and validates JSON.
 * On invalid JSON asks once more with the validation errors, then fails. Every call is
 * logged to `aiRuns` (without the API key).
 */
export async function runAi<T>(r: Repos, o: RunOptions<T>): Promise<{ value: T; runId: string }> {
  const cfg = await getAiConfig(r);
  if (!cfg.ownKey && !cfg.shared) throw new AiError('noKey', 'API-ключ не задан');
  if (!aiReady(cfg)) throw new AiError('disabled', 'ИИ выключен в настройках');
  if (!cfg.consent) throw new AiError('noConsent', 'Нужно согласие на отправку данных ИИ-сервису');
  // A personal key wins; otherwise the shared AI is used through our server.
  const shared = !cfg.ownKey;
  const proxyToken = shared ? ((await getSession(r))?.token ?? '') : '';
  if (shared && !proxyToken)
    throw new AiError('noKey', 'Войдите в аккаунт, чтобы пользоваться общим ИИ');
  let model = shared ? 'общий ИИ' : o.vision ? cfg.modelVision : cfg.modelText;
  const messages: Message[] = [{ role: 'user', content: o.content }];
  const t0 = performance.now();
  let lastResponse: unknown = null;
  let error: string | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await callClaude({
        apiKey: cfg.apiKey.trim(),
        baseUrl: cfg.baseUrl,
        format: cfg.format,
        vision: o.vision,
        ...(shared ? { proxyToken } : {}),
        model,
        system: o.system,
        messages,
        ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
        ...(o.retryDelayMs !== undefined ? { retryDelayMs: o.retryDelayMs } : {}),
        ...(o.timeoutMs !== undefined ? { timeoutMs: o.timeoutMs } : {}),
      });
      lastResponse = res.raw;
      // In shared mode the service reports which model it actually used.
      const used = (res.raw as { model?: unknown }).model;
      if (shared && typeof used === 'string' && used) model = used;
      let errors: string[];
      try {
        const v = o.validate(extractFirstJson(res.text));
        if (v.ok) {
          const run = await log(r, o.kind, model, messages, lastResponse, t0);
          return { value: v.value, runId: run.id };
        }
        errors = v.errors;
      } catch (e) {
        errors = [(e as Error).message];
      }
      messages.push(
        { role: 'assistant', content: res.text },
        { role: 'user', content: retryMessage(errors) },
      );
    }
    throw new AiError('invalidJson', 'ИИ вернул данные в неверном формате');
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    // Which kind of AI failure (timeout, invalid answer…) and for what: no text, no key.
    reportError(e, {
      where: 'ai',
      ai: o.kind,
      failure: (e as { kind?: string }).kind ?? 'unknown',
    });
    await log(r, o.kind, model, messages, lastResponse, t0, error);
    throw e;
  }
}

function log(
  r: Repos,
  kind: AiRun['kind'],
  model: string,
  messages: Message[],
  response: unknown,
  t0: number,
  error?: string,
) {
  return r.aiRuns.create({
    kind,
    model,
    request: logRequest(model, '(system prompt)', messages),
    response: (response ?? {}) as object,
    latencyMs: Math.round(performance.now() - t0),
    ...(error ? { error } : {}),
  });
}

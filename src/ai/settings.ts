import type { Repos } from '../db/repos';
import { ACCOUNT } from '../services/account';
import type { ApiFormat } from './client';

export const AI_KEYS = {
  enabled: 'aiEnabled',
  apiKey: 'aiApiKey',
  modelText: 'aiModelText',
  modelVision: 'aiModelVision',
  consent: 'aiConsent',
  /** Optional address of an Anthropic-compatible API (empty = Anthropic). */
  baseUrl: 'aiBaseUrl',
  /** 'anthropic' (default) or 'openai' (Chat Completions compatible). */
  format: 'aiFormat',
} as const;

export const AI_DEFAULTS = { modelText: 'claude-haiku-5-5', modelVision: 'claude-sonnet-5-5' };

export type AiConfig = {
  enabled: boolean;
  apiKey: string;
  modelText: string;
  modelVision: string;
  consent: boolean;
  baseUrl: string;
  format: ApiFormat;
  /** The server offers a shared AI to this (signed-in) user. */
  shared: boolean;
  /** A personal key (and, for OpenAI format, an address) is set: it wins over the shared AI. */
  ownKey: boolean;
};

export async function getAiConfig(r: Repos): Promise<AiConfig> {
  const [enabledRaw, apiKey, modelText, modelVision, consent, baseUrl, format, token, sharedFlag] =
    await Promise.all([
      r.settings.get<boolean | null>(AI_KEYS.enabled, null),
      r.settings.get(AI_KEYS.apiKey, ''),
      r.settings.get(AI_KEYS.modelText, AI_DEFAULTS.modelText),
      r.settings.get(AI_KEYS.modelVision, AI_DEFAULTS.modelVision),
      r.settings.get(AI_KEYS.consent, false),
      r.settings.get(AI_KEYS.baseUrl, ''),
      r.settings.get(AI_KEYS.format, 'anthropic'),
      r.settings.get<string>(ACCOUNT.token, ''),
      r.settings.get<boolean>(ACCOUNT.aiShared, false),
    ]);
  const shared = !!token && sharedFlag;
  const fmt: ApiFormat = format === 'openai' ? 'openai' : 'anthropic';
  const base = baseUrl.trim();
  return {
    // Until the user decides, AI is on whenever the shared one is offered.
    enabled: enabledRaw ?? shared,
    apiKey,
    modelText: modelText || AI_DEFAULTS.modelText,
    modelVision: modelVision || AI_DEFAULTS.modelVision,
    consent,
    baseUrl: base,
    format: fmt,
    shared,
    ownKey: apiKey.trim().length > 0 && (fmt === 'anthropic' || base.length > 0),
  };
}

/** AI can be used: switched on and either a personal key or the shared AI is available. */
export const aiReady = (c: AiConfig) => c.enabled && (c.ownKey || c.shared);

export const maskKey = (k: string) => (k.length <= 8 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`);

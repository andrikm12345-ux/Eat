import type { Repos } from '../db/repos';
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
};

export async function getAiConfig(r: Repos): Promise<AiConfig> {
  const [enabled, apiKey, modelText, modelVision, consent, baseUrl, format] = await Promise.all([
    r.settings.get(AI_KEYS.enabled, false),
    r.settings.get(AI_KEYS.apiKey, ''),
    r.settings.get(AI_KEYS.modelText, AI_DEFAULTS.modelText),
    r.settings.get(AI_KEYS.modelVision, AI_DEFAULTS.modelVision),
    r.settings.get(AI_KEYS.consent, false),
    r.settings.get(AI_KEYS.baseUrl, ''),
    r.settings.get(AI_KEYS.format, 'anthropic'),
  ]);
  return {
    enabled,
    apiKey,
    modelText: modelText || AI_DEFAULTS.modelText,
    modelVision: modelVision || AI_DEFAULTS.modelVision,
    consent,
    baseUrl: baseUrl.trim(),
    format: format === 'openai' ? 'openai' : 'anthropic',
  };
}

/** AI can be used: switched on and a key is stored. */
export const aiReady = (c: AiConfig) =>
  c.enabled && c.apiKey.trim().length > 0 && (c.format === 'anthropic' || c.baseUrl.length > 0);

export const maskKey = (k: string) => (k.length <= 8 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`);

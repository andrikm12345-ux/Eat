import { randomDelayMs } from './auth.js';
import { blobStore } from './blobStore.js';
import type { Deps } from './types.js';

/** Production wiring from environment variables. */
export function envDeps(): Deps {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is not configured');
  return {
    secret,
    store: blobStore,
    now: () => Date.now(),
    signupOpen: process.env.SIGNUP_DISABLED !== '1',
    failDelayMs: randomDelayMs,
    adminLogins: (process.env.ADMIN_LOGINS ?? '')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    ...(process.env.SEARCH_API_KEY
      ? {
          search: {
            apiKey: process.env.SEARCH_API_KEY.trim(),
            dailyLimit: Number(process.env.SEARCH_DAILY_LIMIT) || 40,
          },
        }
      : {}),
    ai: {
      ...(process.env.AI_API_KEY ? { apiKey: process.env.AI_API_KEY.trim() } : {}),
      baseUrl: process.env.AI_BASE_URL?.trim() || 'https://tokenharbor.ai/v1',
      modelText: process.env.AI_MODEL_TEXT?.trim() || 'mimo-v2.6-flash:free',
      modelVision: process.env.AI_MODEL_VISION?.trim() || 'mimo-v2.6-flash:free',
      dailyLimit: Number(process.env.AI_DAILY_LIMIT) || 60,
    },
  };
}

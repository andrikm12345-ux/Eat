import { randomDelayMs, setScryptCost } from './auth.js';
import { blobStore } from './blobStore.js';
import { redisConfigFromEnv, redisStore } from './redisStore.js';
import type { Deps } from './types.js';

/**
 * USER_LABELS = {"login": {"weigh": "text"}}: personal button texts. Only short plain strings
 * under known keys are kept; anything malformed is ignored (the app then shows its own texts).
 */
export function parseUserLabels(raw: string | undefined): Record<string, Record<string, string>> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const out: Record<string, Record<string, string>> = {};
    for (const [login, labels] of Object.entries(data)) {
      if (!labels || typeof labels !== 'object') continue;
      const clean: Record<string, string> = {};
      for (const key of ['weigh']) {
        const v = labels[key];
        if (typeof v === 'string' && v.trim()) clean[key] = v.trim().slice(0, 30);
      }
      if (Object.keys(clean).length) out[login.trim().toLowerCase()] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

/** Settings kept in the backup (sealed with BACKUP_KEY). BACKUP_KEY itself is never in it. */
export const BACKED_UP_ENV = [
  'AUTH_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ADMIN_LOGINS',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL_TEXT',
  'AI_MODEL_VISION',
  'AI_DAILY_LIMIT',
  'AI_BUDGET_MS',
  'SEARCH_API_KEY',
  'SEARCH_DAILY_LIMIT',
  'SIGNUP_DISABLED',
  'USER_LABELS',
  'RESTORE_UNTIL',
  'SCRYPT_COST',
] as const;

/** Production wiring from environment variables. */
export function envDeps(): Deps {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is not configured');
  // Optional, for hosts that cap CPU time per request (Cloudflare free plan: 10 ms). Unset = the
  // full cost; existing hashes keep working and are renewed at the next sign-in.
  setScryptCost(process.env.SCRYPT_COST ? Number(process.env.SCRYPT_COST) : undefined);
  return {
    secret,
    // Upstash Redis when connected (KV_REST_API_*), else the private Blob store.
    store: (() => {
      const redis = redisConfigFromEnv(process.env);
      return redis ? redisStore(redis) : blobStore;
    })(),
    // Accounts of old sessions may be restored after a storage move, until this moment (ms).
    ...(Number(process.env.RESTORE_UNTIL) > 0
      ? { restoreUntil: Number(process.env.RESTORE_UNTIL) }
      : {}),
    now: () => Date.now(),
    signupOpen: process.env.SIGNUP_DISABLED !== '1',
    failDelayMs: randomDelayMs,
    adminLogins: (process.env.ADMIN_LOGINS ?? '')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    ...((process.env.BACKUP_KEY ?? '').length >= 32
      ? { backupKey: process.env.BACKUP_KEY as string }
      : {}),
    envSnapshot: () =>
      Object.fromEntries(
        BACKED_UP_ENV.flatMap((name) => {
          const v = process.env[name];
          return v ? [[name, v] as const] : [];
        }),
      ),
    knownLogins: (process.env.KNOWN_LOGINS ?? '')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    userLabels: parseUserLabels(process.env.USER_LABELS),
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
      ...(Number(process.env.AI_BUDGET_MS) > 0
        ? { budgetMs: Number(process.env.AI_BUDGET_MS) }
        : {}),
    },
  };
}

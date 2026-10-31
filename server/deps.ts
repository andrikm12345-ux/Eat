import { randomDelayMs } from './auth.js';
import { blobStore } from './blobStore.js';
import { resendMailer } from './mail.js';
import type { Deps } from './types.js';

/** Production wiring from environment variables. */
export function envDeps(): Deps {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is not configured');
  return {
    secret,
    store: blobStore,
    mail: resendMailer(
      process.env.RESEND_API_KEY,
      process.env.MAIL_FROM ?? 'Дневник <onboarding@resend.dev>',
    ),
    now: () => Date.now(),
    allowed: (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    failDelayMs: randomDelayMs,
  };
}

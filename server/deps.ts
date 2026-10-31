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
  };
}

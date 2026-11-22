import { json } from './http.js';
import type { Deps } from './types.js';

/**
 * GET → {ok:true} when the storage answers, else 503. Read only (a write every minute would eat
 * the storage quota) and it exposes nothing: a monitor pings it to learn that the app is alive
 * and the storage is not blocked or over its limit.
 */
export async function health(d: Deps): Promise<Response> {
  try {
    await d.store.get('health/ping');
    return json({ ok: true });
  } catch (e) {
    console.error('health: storage failed', e);
    return json({ ok: false }, 503);
  }
}

import { envDeps } from '../server/deps.js';
import { health } from '../server/health.js';

export async function GET(): Promise<Response> {
  try {
    return await health(envDeps());
  } catch (e) {
    console.error('health failed', e);
    return Response.json({ ok: false }, { status: 503 });
  }
}

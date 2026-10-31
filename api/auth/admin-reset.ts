import { envDeps } from '../../server/deps.js';
import { adminReset } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await adminReset(envDeps(), request);
  } catch (e) {
    console.error('auth/admin-reset failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

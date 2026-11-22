import { envDeps } from '../../server/deps.js';
import { setRestoredPassword } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await setRestoredPassword(envDeps(), request);
  } catch (e) {
    console.error('auth/set-password failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

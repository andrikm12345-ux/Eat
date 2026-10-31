import { envDeps } from '../../server/deps.js';
import { changePassword } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await changePassword(envDeps(), request);
  } catch (e) {
    console.error('auth/password failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

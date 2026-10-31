import { envDeps } from '../../server/deps.js';
import { resetPassword } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await resetPassword(envDeps(), request);
  } catch (e) {
    console.error('auth/reset failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

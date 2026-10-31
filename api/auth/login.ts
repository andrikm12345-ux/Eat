import { envDeps } from '../../server/deps.js';
import { login } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await login(envDeps(), request);
  } catch (e) {
    console.error('auth/login failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

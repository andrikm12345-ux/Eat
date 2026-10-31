import { envDeps } from '../../server/deps.js';
import { register } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await register(envDeps(), request);
  } catch (e) {
    console.error('auth/register failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

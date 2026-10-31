import { envDeps } from '../../server/deps.js';
import { newRecovery } from '../../server/handlers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await newRecovery(envDeps(), request);
  } catch (e) {
    console.error('auth/recovery failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

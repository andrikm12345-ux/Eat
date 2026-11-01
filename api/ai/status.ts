import { envDeps } from '../../server/deps.js';
import { aiStatus } from '../../server/sharedAi.js';

export async function GET(request: Request): Promise<Response> {
  try {
    return await aiStatus(envDeps(), request);
  } catch (e) {
    console.error('ai/status failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

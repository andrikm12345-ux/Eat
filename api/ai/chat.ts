import { envDeps } from '../../server/deps.js';
import { aiChat } from '../../server/sharedAi.js';

export async function POST(request: Request): Promise<Response> {
  try {
    return await aiChat(envDeps(), request);
  } catch (e) {
    console.error('ai/chat failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

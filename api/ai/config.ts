import { envDeps } from '../../server/deps.js';
import { aiConfigGet, aiConfigPut } from '../../server/sharedAi.js';

async function run(fn: typeof aiConfigGet, request: Request): Promise<Response> {
  try {
    return await fn(envDeps(), request);
  } catch (e) {
    console.error('ai/config failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export const GET = (request: Request) => run(aiConfigGet, request);
export const PUT = (request: Request) => run(aiConfigPut, request);

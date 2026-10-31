import { getSync, putSync } from '../server/handlers.js';
import { envDeps } from '../server/deps.js';

async function run(fn: typeof getSync, request: Request): Promise<Response> {
  try {
    return await fn(envDeps(), request);
  } catch (e) {
    console.error('sync failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export const GET = (request: Request) => run(getSync, request);
export const PUT = (request: Request) => run(putSync, request);

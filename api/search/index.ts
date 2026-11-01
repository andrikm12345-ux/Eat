import { envDeps } from '../../server/deps.js';
import { searchStatus, webSearch } from '../../server/webSearch.js';

async function run(fn: typeof webSearch, request: Request): Promise<Response> {
  try {
    return await fn(envDeps(), request);
  } catch (e) {
    console.error('search failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export const GET = (request: Request) => run(searchStatus, request);
export const POST = (request: Request) => run(webSearch, request);

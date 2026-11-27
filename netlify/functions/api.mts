/**
 * One Netlify function for every /api/* address: it hands the request to the same handlers the
 * Vercel files in `api/` use (they take a Request and return a Response), so the server code is the
 * same on both hosts. Netlify calls the default export; `config.path` says which addresses it gets.
 */
import * as admin from '../../api/admin.js';
import * as aiChat from '../../api/ai/chat.js';
import * as aiConfig from '../../api/ai/config.js';
import * as aiStatus from '../../api/ai/status.js';
import * as login from '../../api/auth/login.js';
import * as password from '../../api/auth/password.js';
import * as recovery from '../../api/auth/recovery.js';
import * as register from '../../api/auth/register.js';
import * as reset from '../../api/auth/reset.js';
import * as setPassword from '../../api/auth/set-password.js';
import * as backup from '../../api/backup.js';
import * as health from '../../api/health.js';
import * as search from '../../api/search/index.js';
import * as sync from '../../api/sync.js';

type Handler = (request: Request) => Response | Promise<Response>;
type Methods = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', Handler>>;

const routes: Record<string, Methods> = {
  '/api/admin': admin,
  '/api/ai/chat': aiChat,
  '/api/ai/config': aiConfig,
  '/api/ai/status': aiStatus,
  '/api/auth/login': login,
  '/api/auth/password': password,
  '/api/auth/recovery': recovery,
  '/api/auth/register': register,
  '/api/auth/reset': reset,
  '/api/auth/set-password': setPassword,
  '/api/backup': backup,
  '/api/health': health,
  '/api/search': search,
  '/api/sync': sync,
};

export default async function handler(request: Request): Promise<Response> {
  // Called by its own address, the path starts with /.netlify/functions/api.
  const path =
    new URL(request.url).pathname
      .replace(/^\/\.netlify\/functions\/api/, '/api')
      .replace(/\/+$/, '') || '/api';
  const methods = routes[path];
  if (!methods) return Response.json({ error: 'not_found' }, { status: 404 });
  const run = methods[request.method as keyof Methods];
  if (!run) return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  return run(request);
}

export const config = { path: '/api/*' };

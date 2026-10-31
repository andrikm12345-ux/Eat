import { verifyCode } from '../../server/handlers';
import { envDeps } from '../../server/deps';

export async function POST(request: Request): Promise<Response> {
  try {
    return await verifyCode(envDeps(), request);
  } catch (e) {
    console.error('auth/verify failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

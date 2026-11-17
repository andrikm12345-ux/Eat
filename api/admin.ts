import { adminRemoveTestUsers, adminUsers } from '../server/admin.js';
import { envDeps } from '../server/deps.js';

export async function GET(request: Request): Promise<Response> {
  try {
    return await adminUsers(envDeps(), request);
  } catch (e) {
    console.error('admin failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    return await adminRemoveTestUsers(envDeps(), request);
  } catch (e) {
    console.error('admin clean-up failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

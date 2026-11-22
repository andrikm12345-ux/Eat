import { backup } from '../server/backup.js';
import { envDeps } from '../server/deps.js';

const run = async (request: Request): Promise<Response> => {
  try {
    return await backup(envDeps(), request, process.env.BACKUP_TOKEN);
  } catch (e) {
    console.error('backup failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
};

export const GET = run;
export const POST = run;

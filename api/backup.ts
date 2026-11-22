import { backup } from '../server/backup.js';
import { envDeps } from '../server/deps.js';

/** Only workflows of this repository may call it (checked from GitHub's signed identity token). */
const REPO = process.env.BACKUP_REPO ?? 'andrikm12345-ux/Eat';

const run = async (request: Request): Promise<Response> => {
  try {
    return await backup(envDeps(), request, REPO);
  } catch (e) {
    console.error('backup failed', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
};

export const GET = run;
export const POST = run;

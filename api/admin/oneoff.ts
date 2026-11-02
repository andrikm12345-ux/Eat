// ONE-OFF (removed right after use): inspect / reset the cloud copy of ONE named test account.
// Opened by a random key held only in the environment; the login is fixed in the code.
import { timingSafeEqual } from 'node:crypto';
import { userIdFor } from '../../server/auth.js';
import { blobStore } from '../../server/blobStore.js';

const ONLY_LOGIN = 'qwerty';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ONE_OFF_KEY;
  const given = request.headers.get('x-one-off-key') ?? '';
  // Anything else looks like a page that does not exist.
  if (!key || key.length < 32 || !same(given, key))
    return new Response('Not found', { status: 404 });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ error: 'no secret' }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const path = `users/${userIdFor(secret, ONLY_LOGIN)}.json`;
  const text = await blobStore.get(path);
  let tables: Record<string, number> = {};
  let schemaVersion = 1;
  let exportedAt: string | null = null;
  if (text) {
    const data = JSON.parse(text) as {
      schemaVersion?: number;
      exportedAt?: string;
      tables?: Record<string, unknown[]>;
    };
    schemaVersion = data.schemaVersion ?? 1;
    exportedAt = data.exportedAt ?? null;
    tables = Object.fromEntries(
      Object.entries(data.tables ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    );
  }
  const before = { exists: !!text, bytes: text?.length ?? 0, exportedAt, tables };
  if (body.action !== 'wipe') return Response.json({ login: ONLY_LOGIN, before });

  await blobStore.put(
    path,
    JSON.stringify({
      format: 'dnevnik-backup',
      schemaVersion,
      exportedAt: new Date().toISOString(),
      tables: {},
    }),
  );
  const after = await blobStore.get(path);
  return Response.json({ login: ONLY_LOGIN, before, wiped: true, bytesAfter: after?.length ?? 0 });
}

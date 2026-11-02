// ONE-OFF (removed right after use): delete every account except the administrators.
import { timingSafeEqual } from 'node:crypto';
import { del, list } from '@vercel/blob';
import { userIdFor } from '../../server/auth.js';

const PREFIXES = ['creds/', 'users/', 'usage/', 'search-usage/', 'attempts/'];

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ONE_OFF_KEY;
  const given = request.headers.get('x-one-off-key') ?? '';
  if (!key || key.length < 32 || !same(given, key))
    return new Response('Not found', { status: 404 });
  const secret = process.env.AUTH_SECRET;
  const admins = (process.env.ADMIN_LOGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!secret || admins.length === 0) return Response.json({ error: 'no config' }, { status: 500 });
  const keep = admins.map((l) => userIdFor(secret, l));
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  const doomed: string[] = [];
  const kept: string[] = [];
  const accounts = new Set<string>();
  for (const prefix of PREFIXES) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 500 });
      for (const b of page.blobs) {
        const rest = b.pathname.slice(prefix.length);
        const id = rest.split(/[/.]|-/)[0] ?? '';
        if (prefix === 'creds/') accounts.add(id);
        (keep.includes(id) ? kept : doomed).push(b.pathname);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  const adminHasCreds = [...accounts].some((id) => keep.includes(id));
  const summary = {
    admins: admins.length,
    adminHasCreds,
    accountsTotal: accounts.size,
    accountsToDelete: [...accounts].filter((id) => !keep.includes(id)).length,
    blobsToDelete: doomed.length,
    blobsKept: kept.length,
  };
  if (body.action !== 'purge') return Response.json({ dryRun: true, ...summary });
  // Safety: never purge if the administrator account was not found.
  if (!adminHasCreds) return Response.json({ error: 'admin not found', ...summary }, { status: 409 });
  for (let i = 0; i < doomed.length; i += 100) await del(doomed.slice(i, i + 100));
  return Response.json({ purged: true, ...summary });
}

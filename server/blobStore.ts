import { del, get, list, put } from '@vercel/blob';
import type { Store } from './types.js';

/** Private Vercel Blob store (token comes from BLOB_READ_WRITE_TOKEN). */
const listPaths = async (prefix: string): Promise<string[]> => {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 500 });
    out.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
};

export const blobStore: Store = {
  async get(path) {
    const res = await get(path, { access: 'private' });
    if (!res || res.statusCode !== 200) return null;
    return new Response(res.stream).text();
  },
  async put(path, body) {
    await put(path, body, {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  },
  list: listPaths,
  async remove(prefix) {
    const paths = await listPaths(prefix);
    for (let i = 0; i < paths.length; i += 100) await del(paths.slice(i, i + 100));
    return paths.length;
  },
};

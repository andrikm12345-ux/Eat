import { get, list, put } from '@vercel/blob';
import type { Store } from './types.js';

/** Private Vercel Blob store (token comes from BLOB_READ_WRITE_TOKEN). */
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
  async list(prefix) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 500 });
      out.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
};

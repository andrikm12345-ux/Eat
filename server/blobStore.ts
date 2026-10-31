import { get, put } from '@vercel/blob';
import type { Store } from './types';

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
};

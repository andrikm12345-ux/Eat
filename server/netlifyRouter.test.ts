import { beforeAll, describe, expect, it } from 'vitest';
import handler, { config } from '../netlify/functions/api.mjs';

const call = (method: string, path: string, init: RequestInit = {}) =>
  handler(new Request(`https://site.example${path}`, { method, ...init }));

beforeAll(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40);
});

describe('Netlify function: one router for every /api address', () => {
  it('takes every /api/* address', () => {
    expect(config.path).toBe('/api/*');
  });

  it('unknown addresses are 404, a wrong method is 405', async () => {
    expect((await call('GET', '/api/nothing')).status).toBe(404);
    expect((await call('GET', '/api/auth/login')).status).toBe(405);
    expect((await call('DELETE', '/api/sync')).status).toBe(405);
  });

  it('reaches the real handlers (they say who is allowed in)', async () => {
    expect((await call('GET', '/api/sync')).status).toBe(401);
    expect((await call('POST', '/api/ai/chat', { body: '{}' })).status).toBe(401);
    expect((await call('GET', '/api/backup?prefix=creds/')).status).toBe(401);
    expect((await call('GET', '/api/admin')).status).toBe(401);
  });

  it('works under its own address and with a trailing slash too', async () => {
    expect((await call('GET', '/.netlify/functions/api/sync')).status).toBe(401);
    expect((await call('GET', '/api/sync/')).status).toBe(401);
  });
});

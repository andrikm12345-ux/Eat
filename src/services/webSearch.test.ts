import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../db/repos';
import { ACCOUNT } from './account';
import {
  formatWebContext,
  hostOf,
  searchQuery,
  searchWeb,
  withWebContext,
  type WebHit,
} from './webSearch';

const hit: WebHit = {
  title: 'Треугольник с курицей',
  url: 'https://www.shop.example/a?x=1',
  content: 'Калорийность 230 ккал,\nбелки 10 г',
};

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
});

describe('helpers', () => {
  it('host without www, and the raw text when it is not a URL', () => {
    expect(hostOf('https://www.shop.example/a')).toBe('shop.example');
    expect(hostOf('not a url')).toBe('not a url');
  });
  it('query steers to nutrition facts and is cut', () => {
    const q = searchQuery('  Жар   Свежар  ' + 'x'.repeat(300));
    expect(q.startsWith('Жар Свежар xxx')).toBe(true);
    expect(q.endsWith('калорийность БЖУ на 100 г вес 1 шт')).toBe(true);
    expect(q.length).toBeLessThan(260);
  });
  it('formats hits for the AI and passes the description through when there are none', () => {
    expect(formatWebContext([])).toBeNull();
    const web = formatWebContext([hit]);
    expect(web?.text).toBe(
      '[1] Треугольник с курицей (shop.example): Калорийность 230 ккал, белки 10 г',
    );
    expect(web?.sources).toEqual([{ title: hit.title, url: hit.url }]);
    expect(withWebContext('2 треугольника', null)).toBe('2 треугольника');
    const msg = withWebContext('2 треугольника', web);
    expect(msg).toContain('2 треугольника');
    expect(msg).toContain('Справка из интернета');
    expect(msg).toContain('230 ккал');
  });
});

describe('searchWeb', () => {
  const signIn = () => repos.settings.set(ACCOUNT.token, 'tok');

  it('does nothing without an account or for a too short description', async () => {
    const f = vi.fn();
    expect(await searchWeb(repos, 'два треугольника', f as unknown as typeof fetch)).toBeNull();
    await signIn();
    expect(await searchWeb(repos, 'ab', f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('asks our server with the session token and returns the reference', async () => {
    await signIn();
    const f = vi.fn(async () => Response.json({ results: [hit] }));
    const web = await searchWeb(repos, 'Жар Свежар треугольник', f as unknown as typeof fetch);
    expect(web?.sources[0]?.url).toBe(hit.url);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/search');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body)).query).toContain('Жар Свежар треугольник');
  });

  it('returns null on a limit, an error status, a bad reply or a network failure', async () => {
    await signIn();
    const as = (f: unknown) => f as typeof fetch;
    expect(
      await searchWeb(
        repos,
        'сыр',
        as(async () => new Response('{}', { status: 429 })),
      ),
    ).toBeNull();
    expect(
      await searchWeb(
        repos,
        'сыр',
        as(async () => new Response('<html>')),
      ),
    ).toBeNull();
    expect(
      await searchWeb(
        repos,
        'сыр',
        as(async () => Response.json({ results: 5 })),
      ),
    ).toBeNull();
    expect(
      await searchWeb(
        repos,
        'сыр',
        as(async () => {
          throw new Error('offline');
        }),
      ),
    ).toBeNull();
  });
});

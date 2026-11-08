import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  buildIndex,
  editDistance,
  matchScore,
  search,
  swapLayout,
  tokenize,
  tokenScore,
  usageBoost,
  type SearchItem,
} from './search';

const item = (id: string, name: string, extra: Partial<SearchItem> = {}): SearchItem => ({
  id,
  name,
  useCount: 0,
  verified: false,
  ...extra,
});

const NOW = Date.parse('2026-03-01T12:00:00Z');

describe('text helpers', () => {
  it('swaps keyboard layouts both ways', () => {
    expect(swapLayout('ghbdtn')).toBe('привет');
    expect(swapLayout('руддщ')).toBe('hello');
    expect(swapLayout('123 ,')).toBe('123 б');
  });
  it('tokenizes with ё→е and punctuation removal', () => {
    expect(tokenize('Творог 5%, «Простоквашино» Ёлки')).toEqual([
      'творог',
      '5%',
      'простоквашино',
      'елки',
    ]);
    expect(tokenize('  ')).toEqual([]);
  });
  it('edit distance with early exit', () => {
    expect(editDistance('гречка', 'гречка', 1)).toBe(0);
    expect(editDistance('гречка', 'грешка', 1)).toBe(1);
    expect(editDistance('abc', 'abcdef', 1)).toBe(2);
    expect(editDistance('абвгд', 'еёжзи', 1)).toBe(2);
    expect(editDistance('a'.repeat(100), 'a'.repeat(99) + 'b', 1)).toBe(1);
  });
  it('token score levels', () => {
    expect(tokenScore('банан', 'банан')).toBe(3);
    expect(tokenScore('бан', 'банан')).toBe(2);
    expect(tokenScore('нан', 'банан')).toBe(1.5);
    expect(tokenScore('на', 'банан')).toBe(0);
    expect(tokenScore('бонан', 'банан')).toBe(1);
    expect(tokenScore('грчка', 'гречка')).toBe(1);
    expect(tokenScore('кртфль', 'картофель')).toBe(0);
    expect(tokenScore('картошель', 'картофель')).toBe(1);
    expect(tokenScore('xyzw', 'банан')).toBe(0);
  });
  it('match score requires every token and rewards exact/prefix keys', () => {
    const [ix] = buildIndex([item('1', 'Куриная грудка', { brand: 'Петелинка' })]);
    // The same words in another order are the same name.
    expect(matchScore(['грудка', 'куриная'], 'грудка куриная', ix!)).toBe(5);
    expect(matchScore(['куриная', 'грудка'], 'куриная грудка', ix!)).toBe(5);
    expect(matchScore(['кур'], 'кур', ix!)).toBe(3);
    expect(matchScore(['петелинка'], 'петелинка', ix!)).toBe(3);
    expect(matchScore(['кур', 'сыр'], 'кур сыр', ix!)).toBe(0);
  });
  it('usage boost', () => {
    expect(usageBoost(item('a', 'x'), NOW)).toBe(0);
    expect(usageBoost(item('a', 'x', { useCount: 3, verified: true }), NOW)).toBeCloseTo(1.7);
    expect(usageBoost(item('a', 'x', { lastUsedAt: '2026-03-01T12:00:00Z' }), NOW)).toBeCloseTo(
      1.5,
    );
    expect(usageBoost(item('a', 'x', { lastUsedAt: '2026-01-01T00:00:00Z' }), NOW)).toBe(0);
    expect(usageBoost(item('a', 'x', { lastUsedAt: '2026-04-01T00:00:00Z' }), NOW)).toBe(0);
  });
});

describe('search', () => {
  const index = buildIndex([
    item('1', 'Гречка варёная', { verified: true }),
    item('2', 'Гречка (крупа)', {
      verified: true,
      useCount: 20,
      lastUsedAt: '2026-02-28T08:00:00Z',
    }),
    item('3', 'Ёжики мясные'),
    item('4', 'Банан'),
    item('5', 'Бананы сушёные'),
    item('6', 'Творог 5%', { brand: 'Простоквашино' }),
  ]);
  const ids = (q: string) => search(index, q, { nowMs: NOW }).map((i) => i.id);

  it('finds by prefix, ranks frequent first', () => {
    expect(ids('греч')).toEqual(['2', '1']);
  });
  it('handles ё/е, wrong layout and typos', () => {
    expect(ids('ежики')).toEqual(['3']);
    expect(ids(',fyfy')).toEqual(['4', '5']);
    expect(ids('гречкка')).toContain('1');
  });
  it('matches brand and word order', () => {
    expect(ids('простоквашино творог')).toEqual(['6']);
  });
  it('empty query and no matches', () => {
    expect(ids('  ')).toEqual([]);
    expect(ids('щщщщщщ')).toEqual([]);
  });
  it('exact name beats prefix match; ties sorted by name', () => {
    expect(ids('банан')).toEqual(['4', '5']);
    const tie = buildIndex([item('b', 'Сыр Б'), item('a', 'Сыр А')]);
    expect(search(tie, 'сыр', { limit: 1, nowMs: NOW }).map((i) => i.id)).toEqual(['a']);
    expect(search(tie, 'сыр').length).toBe(2);
  });

  it('is fast: 5000 items under 50 ms', () => {
    const words = [
      'курица',
      'говядина',
      'сыр',
      'молоко',
      'хлеб',
      'рис',
      'гречка',
      'яблоко',
      'банан',
      'творог',
    ];
    const big = buildIndex(
      Array.from({ length: 5000 }, (_, i) =>
        item(String(i), `${words[i % 10]} ${words[(i * 7) % 10]} вариант ${i}`, {
          useCount: i % 13,
        }),
      ),
    );
    search(big, 'кур', { nowMs: NOW }); // warm-up
    const t0 = performance.now();
    for (const q of ['кур', 'творог 5', 'ujdzlbyf', 'молако']) search(big, q, { nowMs: NOW });
    const per = (performance.now() - t0) / 4;
    expect(per).toBeLessThan(50);
  });
});

describe('bestMatch', () => {
  const index = buildIndex([
    item('1', 'Гречка варёная', { verified: true }),
    item('2', 'Гречка (крупа)', { verified: true }),
    item('3', 'Банан', { verified: false }),
    item('4', 'Рис белый варёный', { verified: true }),
  ]);
  it('exact verified names score 1', () => {
    expect(bestMatch(index, 'гречка варёная')).toMatchObject({ item: { id: '1' }, similarity: 1 });
  });
  it('partial matches score lower; unverified ignored', () => {
    const r = bestMatch(index, 'рис варёный');
    expect(r?.item.id).toBe('4');
    expect(r!.similarity).toBeLessThan(0.8);
    expect(bestMatch(index, 'банан')).toBeNull();
    // Ties keep the first candidate.
    expect(bestMatch(index, 'гречка')?.item.id).toBe('1');
    expect(bestMatch(index, '  ')).toBeNull();
  });
});

describe('word forms', () => {
  it('knows the same word in another form', async () => {
    const { stemOf, tokenScore } = await import('./search');
    expect(stemOf('яйца')).toBe(stemOf('яйцо'));
    expect(stemOf('вареных')).toBe(stemOf('вареное'));
    expect(stemOf('сахара')).toBe(stemOf('сахар'));
    expect(tokenScore('яйца', 'яйцо')).toBe(2.5);
    expect(tokenScore('гречка', 'гречка')).toBe(3);
    expect(tokenScore('мясо', 'масло')).toBe(0);
  });
});

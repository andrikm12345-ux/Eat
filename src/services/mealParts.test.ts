import { describe, expect, it } from 'vitest';
import { parseMealText } from '../domain/mealText';
import { MAX_WEB_PARTS, partsMessage, pickWebParts, renumber } from './mealParts';

describe('meal parts', () => {
  it('searches branded parts first and at most MAX_WEB_PARTS of them', () => {
    const parts = parseMealText(
      'суп 300 г, котлета 2 шт, компот, сырники Домик в деревне 2 шт, Snickers 1 шт',
    );
    const picked = pickWebParts(parts);
    expect(picked).toHaveLength(MAX_WEB_PARTS);
    expect(picked[0]!.raw).toMatch(/Домик|Snickers/);
    expect(picked[1]!.raw).toMatch(/Домик|Snickers/);
  });

  it('the AI message lists only the given parts and refs per part; no refs, no web text', () => {
    const parts = parseMealText('компот, сырники Домик 2 шт');
    const plain = partsMessage(parts, new Map());
    expect(plain).toContain('- компот');
    expect(plain).not.toContain('Справка');
    const refs = new Map([[parts[1]!.raw, '[1] Сырники: 200 ккал']]);
    const withRefs = partsMessage(parts, refs);
    expect(withRefs).toContain('Справка для «сырники Домик»');
    expect(withRefs).toContain('"source": "web"');
    expect(withRefs).not.toContain('Справка для «компот»');
  });

  it('renumbers references so numbers stay unique across searches', () => {
    expect(renumber('[1] A: a\n[2] B: b', 3)).toBe('[4] A: a\n[5] B: b');
  });
});

import { describe, expect, it } from 'vitest';
import { parseMealText } from '../domain/mealText';
import { groupAddOns, MAX_WEB_PARTS, partsMessage, pickWebParts, renumber } from './mealParts';
import { formatWebContext } from './webSearch';

describe('meal parts', () => {
  it('searches the web only for branded parts, at most MAX_WEB_PARTS of them', () => {
    const parts = parseMealText(
      'суп 300 г, котлета 2 шт, компот, сырники Домик в деревне 2 шт, Snickers 1 шт',
    );
    const picked = pickWebParts(parts);
    expect(picked).toHaveLength(2);
    expect(picked.every((p) => /Домик|Snickers/.test(p.raw))).toBe(true);
    expect(pickWebParts(parseMealText('суп, котлета, компот'))).toHaveLength(0);
    const many = parseMealText('Snickers 1, Mars 1, Twix 1, Bounty 1');
    expect(pickWebParts(many)).toHaveLength(MAX_WEB_PARTS);
  });

  it('glues add-ons to their dish, and only dishes that go to the AI together', () => {
    const parts = parseMealText(
      'овсянка на молоке с бананом и мёдом, кофе с молоком и сахаром, бутерброд с сыром и маслом',
    );
    const all = groupAddOns(parts, new Set(parts));
    expect(all.map((p) => p.raw)).toEqual([
      'овсянка на молоке с бананом и мёдом',
      'кофе с молоком и сахаром',
      'бутерброд с сыром и маслом',
    ]);
    // the dish before is counted by the catalog: the add-on stays on its own
    const alone = groupAddOns(parts, new Set(parts.slice(1)));
    expect(alone.map((p) => p.raw)).toEqual([
      'мёдом',
      'кофе с молоком и сахаром',
      'бутерброд с сыром и маслом',
    ]);
    const salad = parseMealText('салат из огурцов и помидоров со сметаной, хлеб, компот');
    expect(groupAddOns(salad, new Set(salad)).map((p) => p.raw)).toEqual([
      'салат из огурцов и помидоров со сметаной',
      'хлеб',
      'компот',
    ]);
    // a counted fragment is never glued
    const counted = parseMealText('суп из курицы и хлеб 2 куска');
    expect(groupAddOns(counted, new Set(counted))).toHaveLength(2);
  });

  it('knows a shop or a cafe written in lower case and keeps the filling with its dish', () => {
    const parts = parseMealText(
      'Хачапури с сыром и ветчиной пятёрочка кафе, самса с курицей пятёрочка кафе, чай с двумя ложками сахара, стакан томатного сока',
    );
    const todo = groupAddOns(parts, new Set(parts));
    expect(todo.map((p) => p.raw)).toEqual([
      'Хачапури с сыром и ветчиной пятёрочка кафе',
      'самса с курицей пятёрочка кафе',
      'чай с двумя ложками сахара',
      'стакан томатного сока',
    ]);
    // the web is searched for the two items from the shop, not for the tea and the juice
    expect(pickWebParts(todo).map((p) => p.raw)).toEqual([
      'Хачапури с сыром и ветчиной пятёрочка кафе',
      'самса с курицей пятёрочка кафе',
    ]);
    expect(pickWebParts(parseMealText('булочка из Магнита, суп'))).toHaveLength(1);
  });

  it('gives the AI the whole description and what the catalog already counted', () => {
    const msg = partsMessage(parseMealText('кофе с молоком'), new Map(), {
      text: 'гречка 200 г, кофе с молоком',
      done: ['гречка 200 г'],
    });
    expect(msg).toContain('«гречка 200 г, кофе с молоком»');
    expect(msg).toContain('не повторяй: гречка 200 г');
    expect(msg).toContain('- кофе с молоком');
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

  it('a web reference is short: three hits at most, each excerpt cut', () => {
    const hits = Array.from({ length: 6 }, (_, i) => ({
      title: `T${i}`,
      url: `https://s${i}.example/p`,
      content: 'x'.repeat(2000),
    }));
    const web = formatWebContext(hits);
    expect(web?.sources).toHaveLength(3);
    expect(web?.text.length).toBeLessThan(1300);
  });
});

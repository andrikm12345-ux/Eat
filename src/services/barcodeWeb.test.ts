import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../ai/settings';
import { repos } from '../db/repos';
import { ACCOUNT } from './account';
import { barcodeQuestion, identifyBarcodeOnWeb } from './barcodeWeb';
import { saveReview } from './review';
import { remarkNamesProduct } from './webSearch';

const at = { date: '2026-03-01', time: '12:00' };
const hit = {
  title: 'Йогурт',
  url: 'https://www.shop.example/p/1',
  content: 'Йогурт 4,5 %, 95 ккал',
};
const answer = (confidence: string) => ({
  items: [
    {
      name: 'Йогурт натуральный',
      grams: 125,
      per100g: { kcal: 95, protein: 4, fat: 4.5, carbs: 9 },
      confidence,
      assumed: false,
      searchHint: 'йогурт натуральный',
    },
    {
      name: 'Лишнее',
      grams: 1,
      per100g: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
      confidence: 'high',
      assumed: false,
      searchHint: 'x',
    },
  ],
  mealGuess: null,
  notes: '',
});

function stub(confidence = 'medium', search: unknown = { results: [hit] }) {
  const f = vi.fn(async (url: string) =>
    url === '/api/search'
      ? Response.json(search)
      : new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(answer(confidence)) }],
            stop_reason: 'end_turn',
          }),
          { status: 200 },
        ),
  );
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
  await repos.settings.set(AI_KEYS.enabled, true);
  await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
  await repos.settings.set(AI_KEYS.consent, true);
});
afterEach(() => vi.unstubAllGlobals());

describe('barcode lookup on the web', () => {
  it('finds the product from the web reference and keeps the code and sources', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    const f = stub();
    const d = await identifyBarcodeOnWeb(repos, '7601741054531', at);
    expect(d).toMatchObject({
      entrySource: 'barcode',
      barcode: '7601741054531',
      sources: [{ url: hit.url }],
    });
    expect(d?.items).toHaveLength(1);
    expect(d?.items[0]?.name).toBe('Йогурт натуральный');
    const search = JSON.parse(
      String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(search.query).toBe('штрихкод 7601741054531');
    expect(JSON.stringify(f.mock.calls[1])).toContain(
      barcodeQuestion('7601741054531').slice(0, 30),
    );
  });

  it('gives up when the AI is not sure, when there is no account or nothing was found', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    stub('low');
    expect(await identifyBarcodeOnWeb(repos, '7601741054531', at)).toBeNull();
    stub('medium', { results: [] });
    expect(await identifyBarcodeOnWeb(repos, '7601741054531', at)).toBeNull();
    await repos.db.settings.delete(ACCOUNT.token);
    stub();
    expect(await identifyBarcodeOnWeb(repos, '7601741054531', at)).toBeNull();
  });

  it('gives up quietly when the AI fails', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/search'
          ? Response.json({ results: [hit] })
          : new Response('no', { status: 401 }),
      ),
    );
    expect(await identifyBarcodeOnWeb(repos, '7601741054531', at)).toBeNull();
  });

  it('saving the found product binds the barcode, so the next scan finds it', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    stub();
    const d = await identifyBarcodeOnWeb(repos, '7601741054531', at);
    await saveReview(d!);
    const food = await repos.foods.byBarcode('7601741054531');
    expect(food?.name).toBe('Йогурт натуральный');
    // Saved again: the same food is updated, not duplicated.
    await saveReview({ ...d!, items: d!.items.map((i) => ({ ...i, grams: 200 })) });
    expect((await repos.foods.list()).filter((x) => x.barcode === '7601741054531')).toHaveLength(1);
  });
});

describe('does a remark name a product?', () => {
  it('only a brand or a title is worth searching', () => {
    for (const n of [
      'убрать сыр',
      'без соуса',
      'меньше масла',
      'сыра внутри нет',
      '2 штуки',
      'вес штуки 50 г',
    ])
      expect(remarkNamesProduct(n)).toBe(false);
    for (const n of [
      'это Жар Свежар',
      'бренд другой',
      'Coca-Cola',
      'торт «Наполеон»',
      'это производитель Простоквашино',
    ])
      expect(remarkNamesProduct(n)).toBe(true);
  });
});

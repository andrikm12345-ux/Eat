import { describe, expect, it, vi } from 'vitest';
import { repos } from '../db/repos';
import { labelToDraft, mealToDraft, mealToIngredients } from '../services/aiFood';
import { swapAlt } from '../state/review';
import {
  AiError,
  callClaude,
  checkKey,
  headers,
  isCustomBase,
  listModels,
  messagesUrl,
  modelsUrl,
  normalizeBase,
  supportsEffort,
} from './client';
import { extractFirstJson } from './json';
import { PROMPT_MEAL } from './prompts';
import { runAi } from './run';
import { AI_KEYS, maskKey } from './settings';
import { validateLabel, validateMeal, validateWeekly } from './validators';

const KEY = 'sk-ant-test-0123456789';
const meal = {
  items: [
    {
      name: 'Гречка варёная',
      grams: 180,
      per100g: { kcal: 92, protein: 3.4, fat: 0.6, carbs: 20 },
      confidence: 'high',
      assumed: false,
      searchHint: 'гречка варёная',
    },
    {
      name: 'Масло сливочное',
      grams: 10,
      per100g: { kcal: 717, protein: 0.9, fat: 81, carbs: 0.1 },
      confidence: 'low',
      assumed: true,
      searchHint: 'масло сливочное',
    },
  ],
  mealGuess: 'обед',
  notes: 'масло предположено 10 г',
};

const reply = (text: string, extra: object = {}) =>
  new Response(
    JSON.stringify({
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text },
      ],
      stop_reason: 'end_turn',
      ...extra,
    }),
    { status: 200 },
  );

async function enableAi() {
  await repos.settings.set(AI_KEYS.enabled, true);
  await repos.settings.set(AI_KEYS.apiKey, KEY);
  await repos.settings.set(AI_KEYS.consent, true);
}

describe('json + validators', () => {
  it('extracts the first object from prose and fences', () => {
    expect(extractFirstJson('Вот:\n```json\n{"a":{"b":"}"},"c":[1]}\n``` готово {"x":1}')).toEqual({
      a: { b: '}' },
      c: [1],
    });
    expect(extractFirstJson('{"s":"\\"q\\""}')).toEqual({ s: '"q"' });
    expect(() => extractFirstJson('нет')).toThrow();
    expect(() => extractFirstJson('{"a":1')).toThrow();
  });
  it('meal schema', () => {
    expect(validateMeal(meal).ok).toBe(true);
    const bad = validateMeal({
      items: [{ name: '', grams: -1, per100g: {}, confidence: 'x', assumed: 'no' }],
      notes: 5,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(4);
    expect(validateMeal({ items: [] }).ok).toBe(false);
    expect(validateMeal('x').ok).toBe(false);
    expect(validateMeal({ items: ['x'] }).ok).toBe(false);
    const v = validateMeal({ items: [{ ...meal.items[0], searchHint: '' }], mealGuess: 'null' });
    expect(v.ok && v.value.items[0]!.searchHint).toBe('Гречка варёная');
    expect(v.ok && v.value.mealGuess).toBeNull();
  });
  it('label schema', () => {
    const ok = validateLabel({
      name: 'Кефир',
      brand: null,
      barcode: null,
      per100g: { kcal: 59, protein: 3, fat: 3.2, carbs: 4.5, fiber: null },
      serving: { label: '', grams: 250 },
      confidence: 'high',
      warnings: ['x', 1],
    });
    expect(ok.ok && ok.value).toMatchObject({
      name: 'Кефир',
      brand: null,
      serving: { label: 'порция', grams: 250 },
      warnings: ['x'],
    });
    expect(
      validateLabel({ per100g: { kcal: 1, protein: 60, fat: 30, carbs: 30 }, confidence: 'high' })
        .ok,
    ).toBe(false);
    expect(validateLabel({ per100g: 'x', confidence: 'q', warnings: 'x' }).ok).toBe(false);
    expect(validateLabel(null).ok).toBe(false);
  });
  it('weekly schema', () => {
    expect(
      validateWeekly({
        observations: [{ title: 'a', text: 'b', evidence: 'c' }],
        suggestions: [{ text: 's', type: 'fiber' }],
        dataQuality: 'good',
      }).ok,
    ).toBe(true);
    expect(validateWeekly({ observations: [], suggestions: 'x', dataQuality: 'bad' }).ok).toBe(
      false,
    );
    expect(
      validateWeekly({ observations: [{ title: '' }], suggestions: [{}], dataQuality: 'poor' }).ok,
    ).toBe(false);
    expect(validateWeekly(1).ok).toBe(false);
  });
});

describe('client', () => {
  const opts = {
    apiKey: KEY,
    model: 'claude-haiku-5-5',
    system: 's',
    messages: [{ role: 'user' as const, content: 'hi' }],
    retryDelayMs: 1,
  };

  it('sends browser headers, effort for 5.x, returns only text', async () => {
    const f = vi.fn(async () => reply('{"ok":1}'));
    const r = await callClaude({ ...opts, fetchImpl: f });
    expect(r.text).toBe('{"ok":1}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low' },
    });
    expect(supportsEffort('claude-haiku-4-5')).toBe(false);
    expect(headers('k')['content-type']).toBe('application/json');
  });

  it('retries once on 429/5xx, then fails', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(reply('x'));
    expect((await callClaude({ ...opts, fetchImpl: f })).text).toBe('x');
    const g = vi.fn(async () => new Response('down', { status: 529 }));
    await expect(callClaude({ ...opts, fetchImpl: g })).rejects.toMatchObject({ kind: 'server' });
    expect(g).toHaveBeenCalledTimes(2);
  });

  it('does not retry auth / bad request; handles refusal, empty and network', async () => {
    const a = vi.fn(async () => new Response('no', { status: 401 }));
    await expect(callClaude({ ...opts, fetchImpl: a })).rejects.toMatchObject({ kind: 'auth' });
    expect(a).toHaveBeenCalledTimes(1);
    await expect(
      callClaude({ ...opts, fetchImpl: vi.fn(async () => new Response('bad', { status: 400 })) }),
    ).rejects.toMatchObject({ kind: 'badRequest' });
    await expect(
      callClaude({ ...opts, fetchImpl: vi.fn(async () => reply('x', { stop_reason: 'refusal' })) }),
    ).rejects.toMatchObject({ kind: 'refusal' });
    await expect(
      callClaude({ ...opts, fetchImpl: vi.fn(async () => reply('  ')) }),
    ).rejects.toMatchObject({ kind: 'empty' });
    const net = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(callClaude({ ...opts, fetchImpl: net })).rejects.toMatchObject({
      kind: 'offline',
    });
    expect(net).toHaveBeenCalledTimes(2);
  });

  it('times out after the limit', async () => {
    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new Error('abort'))),
        ),
    );
    await expect(
      callClaude({ ...opts, fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it('checks the key', async () => {
    expect(
      await checkKey(
        KEY,
        vi.fn(async () => new Response('{}', { status: 200 })),
      ),
    ).toBe(true);
    expect(
      await checkKey(
        KEY,
        vi.fn(async () => new Response('', { status: 401 })),
      ),
    ).toBe(false);
    expect(
      await checkKey(
        KEY,
        vi.fn(async () => Promise.reject(new Error('x'))),
      ),
    ).toBe(false);
    expect(maskKey(KEY)).toBe('sk-ant-…6789');
    expect(maskKey('short')).toBe('••••');
  });
});

describe('runAi', () => {
  const base = {
    kind: 'text' as const,
    vision: false,
    system: PROMPT_MEAL,
    content: [{ type: 'text' as const, text: 'гречка' }],
    validate: validateMeal,
    retryDelayMs: 1,
  };

  it('requires key, enabled and consent', async () => {
    await expect(runAi(repos, base)).rejects.toMatchObject({ kind: 'noKey' });
    await repos.settings.set(AI_KEYS.apiKey, KEY);
    await expect(runAi(repos, base)).rejects.toMatchObject({ kind: 'disabled' });
    await repos.settings.set(AI_KEYS.enabled, true);
    await expect(runAi(repos, base)).rejects.toBeInstanceOf(AiError);
  });

  it('valid answer → value, logged without the key and without image data', async () => {
    await enableAi();
    const f = vi.fn(async () => reply('Вот результат: ' + JSON.stringify(meal)));
    const r = await runAi(repos, {
      ...base,
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(400) },
        },
        ...base.content,
      ],
      fetchImpl: f,
    });
    expect(r.value.items).toHaveLength(2);
    const [log] = await repos.aiRuns.list();
    expect(log).toMatchObject({ kind: 'text', model: 'claude-haiku-5-5' });
    const dump = JSON.stringify(log);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain('AAAA');
    expect(dump).toContain('"bytes":300');
  });

  it('garbage JSON → one retry with the validation errors → success', async () => {
    await enableAi();
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply('{"items": "нет"}'))
      .mockResolvedValueOnce(reply(JSON.stringify(meal)));
    const r = await runAi(repos, { ...base, fetchImpl: f });
    expect(r.value.items[0]!.name).toBe('Гречка варёная');
    const second = JSON.parse(
      (f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(second.messages).toHaveLength(3);
    expect(second.messages[2].content).toMatch(/не прошёл проверку схемы: items/);
  });

  it('garbage twice → invalidJson error, logged', async () => {
    await enableAi();
    const f = vi.fn(async () => reply('совсем не JSON'));
    await expect(runAi(repos, { ...base, fetchImpl: f })).rejects.toMatchObject({
      kind: 'invalidJson',
    });
    expect(f).toHaveBeenCalledTimes(2);
    const [log] = await repos.aiRuns.list();
    expect(log!.error).toMatch(/неверном формате/);
  });

  it('timeout surfaces as an error', async () => {
    await enableAi();
    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new Error('abort'))),
        ),
    );
    await expect(
      runAi(repos, { ...base, fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('catalog matching', () => {
  it('uses verified catalog data for close matches (grams kept), AI as alternative', async () => {
    const f = await repos.foods.add({
      name: 'Гречка варёная',
      per100g: { kcal: 92, protein: 3.4, fat: 0.6, carbs: 19.9 },
      servings: [],
      source: 'base',
      verified: true,
    });
    const v = validateMeal(meal);
    if (!v.ok) throw new Error('invalid');
    const d = await mealToDraft(
      repos,
      v.value,
      { date: '2026-03-01', time: '13:00' },
      { entrySource: 'ai_photo', aiRunId: 'run1' },
    );
    expect(d).toMatchObject({
      mealLabel: 'Обед',
      notes: 'масло предположено 10 г',
      aiRunId: 'run1',
    });
    expect(d.items[0]).toMatchObject({
      foodId: f.id,
      source: 'catalog',
      grams: 180,
      alt: { source: 'ai' },
    });
    expect(d.items[1]).toMatchObject({ source: 'ai', confidence: 'low', assumed: true });
    const swapped = swapAlt(d.items[0]!);
    expect(swapped).toMatchObject({
      source: 'ai',
      grams: 180,
      alt: { source: 'catalog', foodId: f.id },
    });
    expect(swapped.foodId).toBeUndefined();
    expect(swapAlt(d.items[1]!)).toBe(d.items[1]);
  });

  it('recipe import: matches catalog, creates unverified foods otherwise', async () => {
    const f = await repos.foods.add({
      name: 'Масло сливочное',
      per100g: { kcal: 717, protein: 0.9, fat: 81, carbs: 0.1 },
      servings: [],
      source: 'base',
      verified: true,
    });
    const v = validateMeal(meal);
    if (!v.ok) throw new Error('invalid');
    const ings = await mealToIngredients(repos, v.value);
    expect(ings[1]).toEqual({ foodId: f.id, grams: 10 });
    expect(await repos.foods.get(ings[0]!.foodId)).toMatchObject({
      name: 'Гречка варёная',
      verified: false,
      source: 'user',
    });
  });

  it('label draft warns on Atwater mismatch and low confidence', () => {
    const r = labelToDraft(
      {
        name: null,
        brand: 'Б',
        barcode: '1',
        per100g: { kcal: 300, protein: 10, fat: 1, carbs: 10 },
        serving: null,
        confidence: 'low',
        warnings: [],
      },
      '4600',
    );
    expect(r.draft).toMatchObject({ name: '', brand: 'Б', barcode: '4600', servings: [] });
    expect(r.warnings).toHaveLength(2);
  });
});

describe('custom API address', () => {
  it('normalizes the base address', () => {
    expect(normalizeBase('')).toBe('https://api.anthropic.com');
    expect(normalizeBase(undefined)).toBe('https://api.anthropic.com');
    expect(normalizeBase(' https://r.example.com/ ')).toBe('https://r.example.com');
    expect(normalizeBase('https://r.example.com/v1')).toBe('https://r.example.com');
    expect(normalizeBase('https://r.example.com/v1/')).toBe('https://r.example.com');
    expect(messagesUrl('https://r.example.com/v1')).toBe('https://r.example.com/v1/messages');
    expect(modelsUrl('https://r.example.com')).toBe('https://r.example.com/v1/models?limit=1');
    expect(isCustomBase('')).toBe(false);
    expect(isCustomBase('https://r.example.com')).toBe(true);
  });

  it('sends the bearer header only to a custom address', () => {
    expect(headers('k')).not.toHaveProperty('authorization');
    expect(headers('k', 'https://r.example.com')).toMatchObject({
      authorization: 'Bearer k',
      'x-api-key': 'k',
    });
  });

  it('calls the custom address for messages and the key check', async () => {
    const f = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 }),
    );
    await callClaude({
      apiKey: 'k',
      model: 'm',
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
      baseUrl: 'https://r.example.com/v1',
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(f.mock.calls[0]![0]).toBe('https://r.example.com/v1/messages');
    await checkKey('k', f as unknown as typeof fetch, 'https://r.example.com');
    expect(f.mock.calls[1]![0]).toBe('https://r.example.com/v1/models?limit=1');
  });

  it('lists models of the service', async () => {
    const f = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 7 }, { id: 'b' }] }), {
          status: 200,
        }),
    );
    expect(await listModels('k', f as unknown as typeof fetch, 'https://r.example.com/v1')).toEqual(
      ['a', 'b'],
    );
    expect(f.mock.calls[0]![0]).toBe('https://r.example.com/v1/models?limit=200');
    const empty = async () => new Response('{"data":[]}', { status: 200 });
    expect(await listModels('k', empty as unknown as typeof fetch)).toBeNull();
    const bad = async () => new Response('no', { status: 401 });
    expect(await listModels('k', bad as unknown as typeof fetch)).toBeNull();
    const net = async () => {
      throw new TypeError('offline');
    };
    expect(await listModels('k', net as unknown as typeof fetch)).toBeNull();
  });
});

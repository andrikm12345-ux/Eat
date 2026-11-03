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
  toOpenAiMessages,
  listModels,
  messagesUrl,
  modelsUrl,
  normalizeBase,
  supportsEffort,
} from './client';
import { extractFirstJson } from './json';
import { PROMPT_MEAL, PROMPT_PHOTO } from './prompts';
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
  it('numbers that cannot be right are marked low and named in the notes', () => {
    const item = (per100g: Record<string, number>) => ({
      ...meal.items[0],
      name: 'Каша',
      confidence: 'high',
      per100g,
    });
    // 4*10 + 9*10 + 4*10 = 170 kcal, but the answer says 500: does not add up.
    const bad = validateMeal({
      items: [item({ kcal: 500, protein: 10, fat: 10, carbs: 10 })],
      notes: 'ок',
    });
    expect(bad.ok && bad.value.items[0]!.confidence).toBe('low');
    expect(bad.ok && bad.value.notes).toContain('Калории не сходятся с БЖУ: Каша');
    // Consistent numbers keep their confidence.
    const good = validateMeal({ items: [item({ kcal: 170, protein: 10, fat: 10, carbs: 10 })] });
    expect(good.ok && good.value.items[0]!.confidence).toBe('high');
    // More than 100 g of macros in 100 g is impossible.
    const over = validateMeal({ items: [item({ kcal: 600, protein: 60, fat: 40, carbs: 40 })] });
    expect(over.ok && over.value.items[0]!.confidence).toBe('low');
  });
  it('keeps what the model assumed, trimmed, and drops empty values', () => {
    const base = { ...meal.items[0] };
    const v = validateMeal({ items: [{ ...base, assumption: '  без сахара  ' }] });
    expect(v.ok && v.value.items[0]!.assumption).toBe('без сахара');
    const none = validateMeal({ items: [{ ...base, assumption: '  ' }] });
    expect(none.ok && none.value.items[0]).not.toHaveProperty('assumption');
    const nul = validateMeal({ items: [{ ...base, assumption: null }] });
    expect(nul.ok && nul.value.items[0]).not.toHaveProperty('assumption');
  });
  it('the prompts stay short and ask for a one-line answer (a slow model costs seconds per token)', () => {
    expect(PROMPT_MEAL.length).toBeLessThan(2000);
    expect(PROMPT_PHOTO.length).toBeLessThan(3000);
    for (const p of [PROMPT_MEAL, PROMPT_PHOTO]) {
      expect(p).toContain('в одну строку');
      expect(p).not.toContain('ПРОВЕРЬ себя');
    }
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
    expect(
      (await listModels('k', f as unknown as typeof fetch, 'https://r.example.com/v1'))?.map(
        (m) => m.id,
      ),
    ).toEqual(['a', 'b']);
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

  it('explains when the model cannot take images', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          '{"error":{"message":"Model \'x\' does not support image input on /v1/messages. Please use a multimodal model."}}',
          { status: 400 },
        ),
    );
    await expect(
      callClaude({
        apiKey: 'k',
        model: 'm',
        system: 's',
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      kind: 'badRequest',
      message: expect.stringContaining('не понимает фото'),
    });
  });

  it('explains an empty balance (402)', async () => {
    const f = vi.fn(
      async () => new Response('{"error":{"type":"insufficient_balance"}}', { status: 402 }),
    );
    await expect(
      callClaude({
        apiKey: 'k',
        model: 'm',
        system: 's',
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      status: 402,
      message: expect.stringContaining('недостаточно средств'),
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAI-compatible format', () => {
  const base = 'https://openrouter.ai/api/v1/';
  it('builds addresses and headers', () => {
    expect(normalizeBase(base, 'openai')).toBe('https://openrouter.ai/api/v1');
    expect(messagesUrl(base, 'openai')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(modelsUrl(base, 'openai')).toBe('https://openrouter.ai/api/v1/models');
    expect(isCustomBase('', 'openai')).toBe(true);
    expect(headers('k', base, 'openai')).toEqual({
      authorization: 'Bearer k',
      'content-type': 'application/json',
    });
  });

  it('maps messages: system first, images as data URLs', () => {
    const out = toOpenAiMessages('SYS', [
      { role: 'user', content: 'hi' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 't' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
        ],
      },
    ]);
    expect(out[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(out[1]).toEqual({ role: 'user', content: 'hi' });
    expect(out[2]!.content).toEqual([
      { type: 'text', text: 't' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
    ]);
  });

  const call = (f: unknown) =>
    callClaude({
      apiKey: 'k',
      model: 'm',
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
      baseUrl: base,
      format: 'openai',
      fetchImpl: f as typeof fetch,
    });
  const ok = (content: unknown, finish = 'stop') =>
    new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }));

  it('calls chat/completions and reads the reply (string or parts)', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => ok(' {"a":1} '));
    expect((await call(f)).text).toBe('{"a":1}');
    expect(f.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(f.mock.calls[0]![1]!.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 's' });
    expect(body).not.toHaveProperty('system');
    expect((await call(async () => ok([{ text: 'a' }, { text: 'b' }, { x: 1 }]))).text).toBe(
      'a\nb',
    );
  });

  it('reports refusals, empty replies and errors', async () => {
    await expect(call(async () => ok('x', 'content_filter'))).rejects.toMatchObject({
      kind: 'refusal',
    });
    await expect(call(async () => ok(''))).rejects.toMatchObject({ kind: 'empty' });
    await expect(call(async () => ok(null))).rejects.toMatchObject({ kind: 'empty' });
    await expect(call(async () => new Response('{}', { status: 401 }))).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('checks the key and lists models via /models', async () => {
    const f = vi.fn(async (_u: string) => new Response('{"data":[{"id":"m1"}]}'));
    expect(await checkKey('k', f as unknown as typeof fetch, base, 'openai')).toBe(true);
    expect(
      (await listModels('k', f as unknown as typeof fetch, base, 'openai'))?.map((m) => m.id),
    ).toEqual(['m1']);
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://openrouter.ai/api/v1/models',
      'https://openrouter.ai/api/v1/models',
    ]);
  });

  it('marks free and image-capable models and strips the Google prefix', async () => {
    const f = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'a/paid', pricing: { prompt: '0.001', completion: '0.002' } },
            {
              id: 'a/zero',
              pricing: { prompt: '0', completion: '0' },
              architecture: { input_modalities: ['text', 'image'] },
            },
            { id: 'b/x:free', architecture: { input_modalities: ['text'] } },
            { id: 'models/gemini-2.5-flash' },
          ],
        }),
      );
    expect(await listModels('k', f as unknown as typeof fetch, base, 'openai')).toEqual([
      { id: 'a/paid', free: false, vision: null },
      { id: 'a/zero', free: true, vision: true },
      { id: 'b/x:free', free: true, vision: false },
      { id: 'gemini-2.5-flash', free: false, vision: null },
    ]);
  });

  it('OpenAI format without an address does not call anything', async () => {
    const f = vi.fn();
    expect(await checkKey('k', f as unknown as typeof fetch, '', 'openai')).toBe(false);
    expect(await listModels('k', f as unknown as typeof fetch, '  ', 'openai')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

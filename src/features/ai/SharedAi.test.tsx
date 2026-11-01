import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login as srvLogin, register as srvRegister } from '../../../server/handlers';
import { aiChat, aiConfigGet, aiConfigPut, aiStatus } from '../../../server/sharedAi';
import type { Deps } from '../../../server/types';
import { AI_KEYS, aiReady, getAiConfig } from '../../ai/settings';
import { runAi } from '../../ai/run';
import { validateMeal } from '../../ai/validators';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT, registerAccount, signOut } from '../../services/account';
import { loadSharedConfig, refreshSharedAi, saveSharedConfig } from '../../services/sharedAi';
import { renderApp } from '../../test/renderApp';

const meal = {
  items: [
    {
      name: 'Овсяная каша',
      grams: 250,
      confidence: 'medium',
      assumed: false,
      searchHint: 'овсянка',
      per100g: { kcal: 90, protein: 3, fat: 2, carbs: 15 },
    },
  ],
  mealGuess: 'завтрак',
  notes: '',
};

const files = new Map<string, string>();
const upstream: { calls: { url: string; body: Record<string, unknown> }[]; status: number } = {
  calls: [],
  status: 200,
};
let offline = false;

const deps = (over: Partial<Deps> = {}): Deps => ({
  secret: 's'.repeat(40),
  store: { get: async (p) => files.get(p) ?? null, put: async (p, b) => void files.set(p, b) },
  now: () => Date.now(),
  signupOpen: true,
  adminLogins: ['blackjack'],
  ai: {
    apiKey: 'thk_live_SERVER_KEY',
    baseUrl: 'https://ai.example.com/v1',
    modelText: 'text-model',
    modelVision: 'vision-model',
    dailyLimit: 2,
  },
  fetchImpl: (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    upstream.calls.push({ url, body });
    if (upstream.status !== 200)
      return new Response('{"error":"nope"}', { status: upstream.status });
    return new Response(
      JSON.stringify({
        model: body.model,
        choices: [{ message: { content: JSON.stringify(meal) } }],
      }),
    );
  }) as unknown as typeof fetch,
  ...over,
});

let serverDeps: Deps;
beforeEach(() => {
  files.clear();
  upstream.calls = [];
  upstream.status = 200;
  offline = false;
  serverDeps = deps();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline');
    const req = new Request(`http://localhost${url}`, init);
    if (url === '/api/auth/register') return srvRegister(serverDeps, req);
    if (url === '/api/auth/login') return srvLogin(serverDeps, req);
    if (url === '/api/ai/status') return aiStatus(serverDeps, req);
    if (url === '/api/ai/chat') return aiChat(serverDeps, req);
    if (url === '/api/ai/config')
      return req.method === 'PUT' ? aiConfigPut(serverDeps, req) : aiConfigGet(serverDeps, req);
    return new Response('{"empty":true}');
  });
});
afterEach(() => vi.unstubAllGlobals());

const PW = 'password-1';
async function signUp(login: string) {
  await registerAccount(repos, login, PW);
  await refreshSharedAi(repos);
}

describe('shared AI status on the device', () => {
  it('is remembered after signing in, cleared on sign-out, kept when offline', async () => {
    await signUp('ivan');
    expect(await repos.settings.get(ACCOUNT.aiShared, false)).toBe(true);
    expect(await repos.settings.get(ACCOUNT.aiAdmin, true)).toBe(false);
    const cfg = await getAiConfig(repos);
    expect(cfg).toMatchObject({ shared: true, ownKey: false, enabled: true });
    expect(aiReady(cfg)).toBe(true);

    offline = true;
    await refreshSharedAi(repos);
    expect(await repos.settings.get(ACCOUNT.aiShared, false)).toBe(true);

    await signOut(repos);
    await refreshSharedAi(repos);
    expect(aiReady(await getAiConfig(repos))).toBe(false);
  });

  it('an administrator is recognised; a server error keeps the previous answer', async () => {
    await signUp('Blackjack');
    expect(await repos.settings.get(ACCOUNT.aiAdmin, false)).toBe(true);
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    await refreshSharedAi(repos);
    expect(await repos.settings.get(ACCOUNT.aiAdmin, false)).toBe(true);
  });

  it('the shared AI is off when the server has no key; the user can still switch AI off', async () => {
    serverDeps = deps({
      ai: { baseUrl: 'https://a/v1', modelText: 'm', modelVision: 'v', dailyLimit: 5 },
    });
    await signUp('ivan');
    expect(aiReady(await getAiConfig(repos))).toBe(false);
    serverDeps = deps();
    await refreshSharedAi(repos);
    await repos.settings.set(AI_KEYS.enabled, false);
    expect(aiReady(await getAiConfig(repos))).toBe(false);
  });
});

describe('runAi through the shared AI', () => {
  const run = (vision = false) =>
    runAi(repos, {
      kind: 'text',
      vision,
      system: 'SYS',
      content: [{ type: 'text', text: 'овсянка' }],
      validate: validateMeal,
      retryDelayMs: 1,
    });

  it('goes through our server, logs the model the service used, never sends a key', async () => {
    await signUp('ivan');
    await repos.settings.set(AI_KEYS.consent, true);
    const { value, runId } = await run();
    expect(value.items[0]!.name).toBe('Овсяная каша');
    expect(upstream.calls[0]!.url).toBe('https://ai.example.com/v1/chat/completions');
    expect(upstream.calls[0]!.body.model).toBe('text-model');
    const logged = await repos.db.aiRuns.get(runId);
    expect(logged?.model).toBe('text-model');
    expect(JSON.stringify(logged)).not.toContain('SERVER_KEY');
    await run(true);
    expect(upstream.calls[1]!.body.model).toBe('vision-model');
  });

  it('a personal key wins over the shared AI', async () => {
    await signUp('ivan');
    await repos.settings.set(AI_KEYS.consent, true);
    await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-personal-key');
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(meal) }],
          stop_reason: 'end_turn',
        }),
      );
    });
    await run();
    expect(seen).toEqual(['https://api.anthropic.com/v1/messages']);
  });

  it('needs consent, and an account', async () => {
    await signUp('ivan');
    await expect(run()).rejects.toMatchObject({ kind: 'noConsent' });
    await repos.settings.set(AI_KEYS.consent, true);
    await repos.settings.remove(ACCOUNT.token);
    await expect(run()).rejects.toMatchObject({ kind: 'noKey' });
  });

  it('reports the daily limit, an expired login and a switched-off shared AI in plain words', async () => {
    await signUp('ivan');
    await repos.settings.set(AI_KEYS.consent, true);
    await run();
    await run();
    await expect(run()).rejects.toMatchObject({
      kind: 'rate',
      message: expect.stringContaining('суточный лимит'),
    });
    await repos.settings.set(ACCOUNT.token, 'bad.token');
    await expect(run()).rejects.toMatchObject({
      kind: 'auth',
      message: expect.stringContaining('войдите'),
    });
    // Switched off by the administrator after the device last asked.
    await signOut(repos);
    await signUp('blackjack');
    await saveSharedConfig(repos, { enabled: false });
    await repos.settings.set(ACCOUNT.aiShared, true);
    await repos.settings.set(AI_KEYS.consent, true);
    await expect(run()).rejects.toMatchObject({
      kind: 'server',
      message: expect.stringContaining('выключен администратором'),
    });
  });
});

describe('administrator settings', () => {
  it('load and save through the server', async () => {
    await signUp('blackjack');
    expect(await loadSharedConfig(repos)).toMatchObject({ modelText: 'text-model', keySet: true });
    expect(await saveSharedConfig(repos, { modelText: 'other' })).toMatchObject({
      modelText: 'other',
    });
    expect(await saveSharedConfig(repos, { baseUrl: 'http://insecure' })).toBeNull();
    offline = true;
    expect(await loadSharedConfig(repos)).toBeNull();
    expect(await saveSharedConfig(repos, { modelText: 'x' })).toBeNull();
    await signOut(repos);
    expect(await loadSharedConfig(repos)).toBeNull();
    expect(await saveSharedConfig(repos, { modelText: 'x' })).toBeNull();
  });
});

describe('screens', () => {
  it('a regular user sees only "AI on" and the consent switch', async () => {
    await signUp('ivan');
    await renderApp('/more/ai');
    expect(await screen.findByRole('switch', { name: ru.ai.enabled })).toBeChecked();
    expect(screen.getByRole('switch', { name: ru.ai.consentSwitch })).not.toBeChecked();
    expect(screen.queryByText(ru.ai.enabledHint)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.ai.consentText)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.ai.shared.own)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.ai.admin.title)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.ai.format)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.ai.logs)).not.toBeInTheDocument();
  });

  it('the consent switch gives and withdraws the consent', async () => {
    await signUp('ivan');
    const user = userEvent.setup();
    await renderApp('/more/ai');
    const sw = await screen.findByRole('switch', { name: ru.ai.consentSwitch });
    await user.click(sw);
    await waitFor(async () => expect(await repos.settings.get(AI_KEYS.consent, false)).toBe(true));
    await waitFor(() => expect(sw).toBeChecked());
    await user.click(sw);
    await waitFor(async () => expect(await repos.settings.get(AI_KEYS.consent, true)).toBe(false));
  });

  it('the administrator also gets the collapsed personal connection', async () => {
    await signUp('blackjack');
    await renderApp('/more/ai');
    expect(await screen.findByText(ru.ai.shared.own)).toBeVisible();
    expect(await screen.findByText(ru.ai.admin.title)).toBeVisible();
    expect(screen.getByText(ru.ai.enabledHint)).toBeVisible();
  });

  it('the request log is for the administrator only', async () => {
    await repos.aiRuns.create({
      kind: 'text',
      model: 'some-model',
      request: {},
      response: {},
      latencyMs: 1500,
    });
    await signUp('ivan');
    await renderApp('/more/ai');
    await screen.findByRole('switch', { name: ru.ai.enabled });
    expect(screen.queryByText(ru.ai.logs)).not.toBeInTheDocument();
    expect(screen.queryByText(/some-model/)).not.toBeInTheDocument();
    cleanup();
    await signOut(repos);
    await signUp('blackjack');
    await renderApp('/more/ai');
    expect(await screen.findByText(ru.ai.logs)).toBeVisible();
    expect(await screen.findByText(/some-model/)).toBeVisible();
  });

  it('the administrator edits the settings for everyone', async () => {
    await signUp('blackjack');
    const user = userEvent.setup();
    await renderApp('/more/ai');
    expect(await screen.findByText(ru.ai.admin.title)).toBeVisible();
    expect(screen.getByText(ru.ai.admin.keySet)).toBeVisible();
    const field = (await screen.findAllByLabelText(ru.ai.modelText))[0]!;
    await user.clear(field);
    await user.type(field, 'new-model');
    await user.click(screen.getByRole('button', { name: ru.ai.admin.save }));
    expect(await screen.findByText(ru.ai.admin.saved)).toBeVisible();
    expect(await loadSharedConfig(repos)).toMatchObject({ modelText: 'new-model' });
    await user.click(screen.getByRole('switch', { name: ru.ai.admin.enabled }));
    await user.click(screen.getByRole('button', { name: ru.ai.admin.save }));
    await waitFor(async () =>
      expect(await loadSharedConfig(repos)).toMatchObject({ enabled: false }),
    );
  });

  it('shows a message when the shared settings cannot be saved', async () => {
    await signUp('blackjack');
    const user = userEvent.setup();
    await renderApp('/more/ai');
    await screen.findByText(ru.ai.admin.title);
    const url = (await screen.findAllByLabelText(ru.ai.baseUrl))[0]!;
    await user.clear(url);
    await user.type(url, 'http://insecure');
    await user.click(screen.getByRole('button', { name: ru.ai.admin.save }));
    expect(await screen.findByText(ru.ai.admin.saveFail)).toBeVisible();
  });

  it('text description works for a signed-in user with no key of their own', async () => {
    await signUp('ivan');
    const user = userEvent.setup();
    const { router } = await renderApp('/add/ai-text?date=2026-03-01&time=08:00');
    await user.click(await screen.findByRole('button', { name: ru.ai.consentAccept }));
    await user.type(await screen.findByLabelText(ru.ai.text.label), 'овсянка 250 г');
    await user.click(screen.getByRole('button', { name: ru.ai.text.go }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    expect(await screen.findByText(ru.review.byAiNoModel)).toBeVisible();
    expect(screen.queryByText(/text-model/)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/review');
  });
});

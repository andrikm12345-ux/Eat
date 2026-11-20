import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { renderApp } from '../../test/renderApp';

async function signIn(admin: boolean) {
  await repos.settings.set(ACCOUNT.token, 'tok');
  await repos.settings.set(ACCOUNT.login, 'boss');
  await repos.settings.set(ACCOUNT.aiAdmin, admin);
}

afterEach(() => vi.unstubAllGlobals());

describe('administrator view', () => {
  it('the entry is on the account screen for the administrator only', async () => {
    await signIn(false);
    const first = await renderApp('/account');
    expect(await screen.findByText(ru.account.what)).toBeVisible();
    expect(screen.queryByText(ru.account.adminOpen)).not.toBeInTheDocument();
    first.unmount();
    await signIn(true);
    await renderApp('/account', { seed: false });
    expect(await screen.findByText(ru.account.adminOpen)).toBeVisible();
  });

  it('lists the accounts', async () => {
    await signIn(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          users: [
            {
              id: 'aaaaaaaaaaaaaaaa',
              login: 'ivan',
              createdAt: Date.UTC(2026, 10, 1),
              lastLogin: null,
              lastSync: null,
              entries: 3,
              me: false,
            },
          ],
        }),
      ),
    );
    await renderApp('/admin');
    expect(await screen.findByText('ivan')).toBeVisible();
    expect(screen.getByText(ru.admin.entriesCount(3))).toBeVisible();
  });

  it('a non-administrator gets the closed message', async () => {
    await signIn(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'forbidden' }, { status: 403 })),
    );
    await renderApp('/admin');
    expect(await screen.findByText(ru.admin.forbidden)).toBeVisible();
  });

  it('shows the eaten food and what is left for the day', async () => {
    await signIn(true);
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const n = (kcal: number) => ({ kcal, protein: 10, fat: 5, carbs: 20 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          login: 'ivan',
          exportedAt: '2026-11-01T10:00:00.000Z',
          profile: null,
          goals: [
            {
              id: 'g',
              validFrom: '2020-01-01',
              createdAt: '2020-01-01',
              kcal: 2000,
              protein: 100,
              fat: 60,
              carbs: 200,
            },
          ],
          entries: [
            {
              id: 'e1',
              date,
              time: '08:30',
              items: [{ name: 'Овсянка', grams: 200, nutrients: n(500) }],
              totals: n(500),
            },
          ],
          weights: [],
          dayMeta: [],
        }),
      ),
    );
    await renderApp('/admin/aaaaaaaaaaaaaaaa');
    expect(await screen.findByText(/Овсянка/)).toBeVisible();
    expect(screen.getByText(/Осталось: 1\s?500/)).toBeVisible();
  });

  it('shows what a person wrote into «Что приготовить» and what the AI gave back', async () => {
    await signIn(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          login: 'ivan',
          exportedAt: '2026-11-20T10:00:00.000Z',
          profile: null,
          goals: [],
          entries: [],
          weights: [],
          dayMeta: [],
          cook: [
            {
              id: 'h1',
              at: '2026-11-20T10:00:00.000Z',
              pantry: 'творог 400 г, мука, банан',
              conditions: {
                basics: true,
                noBuy: true,
                maxMinutes: 30,
                meal: 'breakfast',
                servings: 2,
                wishes: 'без сахара',
              },
              dishes: [
                {
                  name: 'Сырники',
                  minutes: 25,
                  kcal: 520,
                  protein: 31.5,
                  missing: ['Яйцо куриное'],
                  short: [],
                },
              ],
              rejected: 2,
              recipes: [
                {
                  name: 'Сырники',
                  servings: 2,
                  ingredients: ['Творог 400 г'],
                  steps: ['Смешайте творог с мукой (3 мин)'],
                  tip: 'Жарьте на среднем огне',
                },
              ],
            },
          ],
        }),
      ),
    );
    await renderApp('/admin/aaaaaaaaaaaaaaaa');
    expect(await screen.findByText(ru.admin.cookTitle)).toBeVisible();
    expect(screen.getByText('творог 400 г, мука, банан')).toBeVisible();
    expect(
      screen.getByText(
        /2 порции · до 30 мин · завтрак · ничего не докупать · пожелания: без сахара/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/Сырники · 25 мин · 520 ккал, Б 31,5 · докупить: Яйцо куриное/),
    ).toBeVisible();
    expect(screen.getByText(ru.admin.cookRejected(2))).toBeVisible();
    expect(screen.getByText(ru.admin.cookRecipe('Сырники', 2))).toBeVisible();
    expect(screen.getByText('Смешайте творог с мукой (3 мин)')).toBeInTheDocument();
  });

  it('the list shows how many times a person used «Что приготовить»', async () => {
    await signIn(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          users: [
            {
              id: 'aaaaaaaaaaaaaaaa',
              login: 'ivan',
              createdAt: null,
              lastLogin: null,
              lastSync: null,
              entries: 0,
              cookSearches: 4,
              me: false,
            },
          ],
        }),
      ),
    );
    await renderApp('/admin');
    expect(await screen.findByText(ru.admin.cookCount(4))).toBeVisible();
  });

  it('«Удалить» removes a day of «Что приготовить» (asks first) and can be undone', async () => {
    await signIn(true);
    const entry = (id: string, at: string) => ({
      id,
      at,
      pantry: `продукты ${id}`,
      conditions: {
        basics: true,
        noBuy: false,
        maxMinutes: null,
        meal: 'any',
        servings: 1,
        wishes: '',
      },
      dishes: [],
      rejected: 0,
      recipes: [],
    });
    let hidden: string[] = [];
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { hide?: string[]; unhide?: string[] };
          posts.push(body);
          hidden = [...hidden.filter((x) => !body.unhide?.includes(x)), ...(body.hide ?? [])];
          return Response.json({ hidden: hidden.length });
        }
        return Response.json({
          login: 'ivan',
          exportedAt: null,
          profile: null,
          goals: [],
          entries: [],
          weights: [],
          dayMeta: [],
          cook: [
            entry('s-today1', '2026-11-20T10:00:00.000Z'),
            entry('s-today2', '2026-11-20T11:00:00.000Z'),
            entry('s-old001', '2026-11-18T10:00:00.000Z'),
          ].filter((e) => !hidden.includes(e.id)),
        });
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const user = userEvent.setup();
    await renderApp('/admin/aaaaaaaaaaaaaaaa');
    expect(await screen.findByText('продукты s-today1')).toBeVisible();
    const buttons = screen.getAllByRole('button', { name: ru.admin.cookDeleteDay });
    expect(buttons).toHaveLength(2); // one per day
    // And one on every search, so a single one can be removed too.
    expect(screen.getAllByRole('button', { name: /^Удалить подборку/ })).toHaveLength(3);
    // Declining the question deletes nothing.
    await user.click(buttons[0]!);
    expect(posts).toHaveLength(0);
    // The newest day first; it has two searches.
    await user.click(screen.getAllByRole('button', { name: ru.admin.cookDeleteDay })[0]!);
    expect(confirm).toHaveBeenLastCalledWith(ru.admin.cookDeleteDayConfirm(2));
    await waitFor(() => expect(screen.queryByText('продукты s-today1')).toBeNull());
    expect(posts).toEqual([{ id: 'aaaaaaaaaaaaaaaa', hide: ['s-today1', 's-today2'] }]);
    expect(screen.getByText('продукты s-old001')).toBeVisible();
    // A single search: its own button.
    await user.click(screen.getByRole('button', { name: /^Удалить подборку/ }));
    expect(confirm).toHaveBeenLastCalledWith(ru.admin.cookDeleteConfirm);
    await waitFor(() => expect(screen.queryByText('продукты s-old001')).toBeNull());
    expect(posts[1]).toEqual({ id: 'aaaaaaaaaaaaaaaa', hide: ['s-old001'] });
    // Undo from the message.
    await user.click((await screen.findAllByRole('button', { name: ru.common.undo })).at(-1)!);
    expect(await screen.findByText('продукты s-old001')).toBeVisible();
    expect(posts[2]).toEqual({ id: 'aaaaaaaaaaaaaaaa', unhide: ['s-old001'] });
  });
});

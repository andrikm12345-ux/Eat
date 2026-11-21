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

/** A moment of a local day `back` days ago ("today" is what the admin page opens on). */
const dayAt = (back: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

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
              source: 'ai_photo',
            },
            {
              id: 'e2',
              date,
              time: '13:00',
              items: [{ name: 'Суп', grams: 300, nutrients: n(200) }],
              totals: n(200),
              source: 'manual',
            },
            {
              id: 'e3',
              date,
              time: '19:00',
              items: [{ name: 'Чай', grams: 200, nutrients: n(2) }],
              totals: n(2),
            },
          ],
          weights: [],
          dayMeta: [],
        }),
      ),
    );
    await renderApp('/admin/aaaaaaaaaaaaaaaa');
    expect(await screen.findByText(/Овсянка/)).toBeVisible();
    expect(screen.getByText(/Осталось: 1\s?298/)).toBeVisible();
    // How each record was added: the photo one is marked, the others say how too.
    expect(screen.getByText(ru.admin.source.ai_photo)).toBeVisible();
    expect(screen.getByText(ru.admin.source.manual)).toBeVisible();
    expect(screen.getByText(ru.admin.sourceUnknown)).toBeVisible();
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
              at: dayAt(0, 10),
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
            entry('s-today1', dayAt(0, 10)),
            entry('s-today2', dayAt(0, 11)),
            entry('s-old001', dayAt(2, 10)),
          ].filter((e) => !hidden.includes(e.id)),
        });
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const user = userEvent.setup();
    await renderApp('/admin/aaaaaaaaaaaaaaaa');
    expect(await screen.findByText('продукты s-today1')).toBeVisible();
    // Only the chosen day (today): another day's search is not mixed in.
    expect(screen.queryByText('продукты s-old001')).toBeNull();
    const dayButtons = screen.getAllByRole('button', { name: ru.admin.cookDeleteDay });
    expect(dayButtons).toHaveLength(1); // one for the day
    // And one on every search of the day, so a single one can be removed too.
    expect(screen.getAllByRole('button', { name: /^Удалить подборку/ })).toHaveLength(2);
    // Declining the question deletes nothing.
    await user.click(dayButtons[0]!);
    expect(posts).toHaveLength(0);
    // The day has two searches.
    await user.click(screen.getByRole('button', { name: ru.admin.cookDeleteDay }));
    expect(confirm).toHaveBeenLastCalledWith(ru.admin.cookDeleteDayConfirm(2));
    await waitFor(() => expect(screen.queryByText('продукты s-today1')).toBeNull());
    expect(posts).toEqual([{ id: 'aaaaaaaaaaaaaaaa', hide: ['s-today1', 's-today2'] }]);
    // The day is empty now, the person still has searches on other days.
    expect(await screen.findByText(ru.admin.cookNoDay)).toBeVisible();
    // Undo from the message.
    await user.click((await screen.findAllByRole('button', { name: ru.common.undo })).at(-1)!);
    expect(await screen.findByText('продукты s-today1')).toBeVisible();
    expect(posts[1]).toEqual({ id: 'aaaaaaaaaaaaaaaa', unhide: ['s-today1', 's-today2'] });
    // A single search: its own button.
    await user.click(screen.getAllByRole('button', { name: /^Удалить подборку/ })[0]!);
    expect(confirm).toHaveBeenLastCalledWith(ru.admin.cookDeleteConfirm);
    await waitFor(() => expect(screen.queryByText('продукты s-today1')).toBeNull());
    expect(posts[2]).toEqual({ id: 'aaaaaaaaaaaaaaaa', hide: ['s-today1'] });
    expect(screen.getByText('продукты s-today2')).toBeVisible();
    // Going two days back shows that day's search, and not today's.
    await user.click(screen.getByRole('button', { name: ru.admin.prevDay }));
    expect(await screen.findByText(ru.admin.cookNoDay)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.admin.prevDay }));
    expect(await screen.findByText('продукты s-old001')).toBeVisible();
    expect(screen.queryByText('продукты s-today2')).toBeNull();
  });
});

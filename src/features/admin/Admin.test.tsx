import { screen } from '@testing-library/react';
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
});

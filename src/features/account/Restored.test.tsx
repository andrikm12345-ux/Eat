import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

describe('an account restored after a storage move', () => {
  it('asks for a password; after setting it shows the recovery code and the form is gone', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    await repos.settings.set(ACCOUNT.login, 'defeni');
    await repos.settings.set(ACCOUNT.restored, true);
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url === '/api/auth/set-password')
          return new Response(
            JSON.stringify({ ok: true, recoveryCode: 'ABCDE-FGHJK-LMNPQ-RSTUV' }),
            {
              status: 200,
            },
          );
        return new Response('{}', { status: 404 });
      }),
    );
    const user = userEvent.setup();
    await renderApp('/account');
    expect(await screen.findByText(ru.account.restoredTitle)).toBeVisible();
    // a restored account has no current password: the "change password" cards are not offered
    expect(screen.queryByText(ru.account.changeTitle)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(ru.account.newPassword), 'newpassword1');
    await user.click(screen.getByRole('button', { name: ru.account.restoredGo }));
    expect(await screen.findByText('ABCDE-FGHJK-LMNPQ-RSTUV')).toBeVisible();
    expect(calls).toContain('POST /api/auth/set-password');
    await waitFor(async () => expect(await repos.settings.get(ACCOUNT.restored, true)).toBe(false));
  });

  it('a normal account sees no such card', async () => {
    await repos.settings.set(ACCOUNT.token, 'tok');
    await repos.settings.set(ACCOUNT.login, 'ivan');
    await repos.settings.set(ACCOUNT.restored, false);
    await renderApp('/account');
    expect((await screen.findAllByText(ru.account.changeTitle)).length).toBeGreaterThan(0);
    expect(screen.queryByText(ru.account.restoredTitle)).not.toBeInTheDocument();
  });
});

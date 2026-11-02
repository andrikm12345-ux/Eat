import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { renderApp } from '../../test/renderApp';

async function signIn(admin: boolean) {
  await repos.settings.set(ACCOUNT.token, 'tok');
  await repos.settings.set(ACCOUNT.login, 'ivan');
  await repos.settings.set(ACCOUNT.aiAdmin, admin);
}

describe('the AI key is mentioned to the administrator only', () => {
  it('account screen: ordinary user sees no key note, the administrator does', async () => {
    await signIn(false);
    const first = await renderApp('/account');
    expect(await screen.findByText(ru.account.what)).toBeVisible();
    expect(screen.queryByText(/ключ ИИ/)).not.toBeInTheDocument();
    first.unmount();
    await signIn(true);
    await renderApp('/account', { seed: false });
    expect(await screen.findByText(ru.account.whatAdmin)).toBeVisible();
  });

  it('data screen: the same', async () => {
    await signIn(false);
    const first = await renderApp('/data');
    expect(await screen.findByText(ru.data.exportHint)).toBeVisible();
    expect(screen.queryByText(/API-ключ/)).not.toBeInTheDocument();
    first.unmount();
    await signIn(true);
    await renderApp('/data', { seed: false });
    expect(await screen.findByText(ru.data.exportHintAdmin)).toBeVisible();
  });
});

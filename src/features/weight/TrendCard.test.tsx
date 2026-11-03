import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { renderApp } from '../../test/renderApp';

describe('weight card: "Был" / "Была" follows the sex in the profile', () => {
  it('male: "Был", female: "Была"', async () => {
    const first = await renderApp('/');
    expect(await screen.findByText(/^Был \d/)).toBeVisible();
    expect(screen.queryByText(/^Была /)).not.toBeInTheDocument();
    first.unmount();

    const profile = await repos.profile.get();
    await repos.profile.save({ ...profile!, sex: 'female' });
    await renderApp('/', { seed: false });
    expect(await screen.findByText(/^Была \d/)).toBeVisible();
    expect(screen.queryByText(/^Был \d/)).not.toBeInTheDocument();
  });

  it('the wording helper', () => {
    expect(ru.weight.raw('male')).toBe('Был');
    expect(ru.weight.raw('female')).toBe('Была');
  });

  it('shows the personal text of the button when the server gave one, else the usual one', async () => {
    const first = await renderApp('/');
    expect(await screen.findByRole('button', { name: ru.weight.weigh })).toBeVisible();
    first.unmount();
    await repos.settings.set(ACCOUNT.labels, { weigh: 'Вздимониться' });
    await renderApp('/', { seed: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Вздимониться' })).toBeVisible());
    expect(screen.queryByRole('button', { name: ru.weight.weigh })).not.toBeInTheDocument();
  });
});

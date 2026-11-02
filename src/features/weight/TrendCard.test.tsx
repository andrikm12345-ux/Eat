import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
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
});

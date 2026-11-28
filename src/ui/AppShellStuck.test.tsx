import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { routes } from '../routes';
import { renderApp } from '../test/renderApp';
import { STUCK_AFTER_MS } from './AppShell';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the app never shows an empty screen while the local database does not answer', () => {
  it('a skeleton first, then a notice with ways out after a few seconds', async () => {
    // A signed-in, set-up account exists (renderApp prepares it); then the storage stops answering,
    // as it does in the known iOS WebKit hang.
    const first = await renderApp('/');
    first.unmount();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(repos.settings, 'get').mockImplementation(() => new Promise(() => {}));
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
    expect(screen.queryByText(ru.stuck.title)).toBeNull();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS + 500);
    });
    expect(screen.getByText(ru.stuck.title)).toBeVisible();
    expect(screen.getByRole('button', { name: ru.stuck.reload })).toBeVisible();
    expect(screen.getByRole('button', { name: ru.stuck.update })).toBeVisible();
  });
});

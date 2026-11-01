import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';
import { forceUpdate } from './forceUpdate';

describe('forceUpdate', () => {
  it('unregisters workers, clears caches and reloads', async () => {
    const unregister = vi.fn(async () => true);
    const del = vi.fn(async () => true);
    const reload = vi.fn();
    await forceUpdate({
      serviceWorker: { getRegistrations: async () => [{ unregister }] as never },
      caches: { keys: async () => ['a', 'b'], delete: del },
      reload,
    });
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith('a');
    expect(del).toHaveBeenCalledWith('b');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the browser has no service worker or cache API', async () => {
    const reload = vi.fn();
    await forceUpdate({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when clearing fails', async () => {
    const reload = vi.fn();
    await expect(
      forceUpdate({
        serviceWorker: {
          getRegistrations: async () => {
            throw new Error('boom');
          },
        },
        reload,
      }),
    ).rejects.toThrow('boom');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the About screen offers the button and needs a connection', async () => {
    const user = userEvent.setup();
    await renderApp('/more/about');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(await screen.findByRole('button', { name: ru.about.updateGo }));
    expect(await screen.findByText(ru.about.updateOffline)).toBeVisible();
  });

  it('defaults use the real browser APIs (no reload in tests: it is stubbed)', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await forceUpdate();
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

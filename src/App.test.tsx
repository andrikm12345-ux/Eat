import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ru } from './i18n/ru';
import { renderApp } from './test/renderApp';
import { ADD_TILES } from './features/add/addTiles';

describe('app shell', () => {
  it('renders Today with five bottom tabs', async () => {
    await renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: ru.pages.today.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: ru.nav.label });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      ru.nav.today,
      ru.nav.diary,
      ru.nav.progress,
      ru.nav.reports,
      ru.nav.more,
    ]);
    expect(within(nav).getByRole('link', { name: ru.nav.today })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([
    [ru.nav.diary, ru.pages.diary.title, '/diary'],
    [ru.nav.progress, ru.pages.progress.title, '/progress'],
    [ru.nav.reports, ru.pages.reports.title, '/reports'],
    [ru.nav.more, ru.pages.more.title, '/more'],
  ])('navigates to %s', async (tab, heading, path) => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    const nav = screen.getByRole('navigation', { name: ru.nav.label });
    await user.click(within(nav).getByRole('link', { name: tab }));
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(router.state.location.pathname).toBe(path);
  });

  it('shows not-found page for unknown routes', async () => {
    await renderApp('/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: ru.pages.notFound.title }),
    ).toBeVisible();
  });
});

describe('add sheet', () => {
  it('opens from the FAB with all tiles and closes on Escape', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const fab = await screen.findByRole('button', { name: ru.add.fab });
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    await user.click(fab);
    const dialog = screen.getByRole('dialog', { name: ru.add.title });
    for (const { key } of ADD_TILES) {
      expect(within(dialog).getByText(ru.add.tiles[key])).toBeInTheDocument();
    }
    expect(fab).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes via the close button', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.add.fab }));
    await user.click(screen.getByRole('button', { name: ru.add.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens from the manifest shortcut and strips the action param', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/?action=add');
    expect(await screen.findByRole('dialog', { name: ru.add.title })).toBeVisible();
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('routes the scan shortcut to the scanner', async () => {
    const { router } = await renderApp('/?action=scan');
    await waitFor(() => expect(router.state.location.pathname).toBe('/add/barcode'));
  });

  it('ignores the weigh shortcut for now but still strips the param', async () => {
    const { router } = await renderApp('/?action=weigh');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

describe('floating add button', () => {
  it('shows on main tabs only', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    expect(await screen.findByRole('button', { name: ru.add.fab })).toBeVisible();
    await router.navigate('/add/quick');
    await screen.findByRole('heading', { name: ru.quick.title });
    expect(screen.queryByRole('button', { name: ru.add.fab })).not.toBeInTheDocument();
    await router.navigate('/diary');
    expect(await screen.findByRole('button', { name: ru.add.fab })).toBeVisible();
    void user;
  });
});

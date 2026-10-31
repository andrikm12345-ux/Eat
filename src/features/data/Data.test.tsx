import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { exportJson } from '../../services/backup';
import { renderApp } from '../../test/renderApp';

afterEach(() => vi.restoreAllMocks());

describe('data screen', () => {
  it('exports a backup and records it', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderApp('/data');
    expect(await screen.findByText(ru.data.noBackup)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.data.exportJson }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(async () =>
      expect(await repos.settings.get(SETTINGS.backupCount.key, 0)).toBe(1),
    );
  });

  it('restores from a file (merge)', async () => {
    await repos.weights.create({ date: '2026-01-01', time: '07:00', kg: 90, source: 'manual' });
    const backup = await exportJson(repos, { includePhotos: false });
    await repos.db.weights.clear();
    const user = userEvent.setup();
    await renderApp('/data');
    await user.upload(
      await screen.findByTestId('backup-file'),
      new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: ru.data.merge }));
    await waitFor(async () =>
      expect((await repos.weights.list()).some((w) => w.kg === 90)).toBe(true),
    );
  });

  it('rejects a foreign file', async () => {
    const user = userEvent.setup();
    await renderApp('/data');
    await user.upload(
      await screen.findByTestId('backup-file'),
      new File(['{"x":1}'], 'b.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/не резервная копия/)).toBeVisible();
  });

  it('storage and about pages render', async () => {
    await renderApp('/more/about');
    expect(await screen.findByText(ru.about.iphone)).toBeVisible();
  });
});

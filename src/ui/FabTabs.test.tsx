import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ru } from '../i18n/ru';
import { renderApp } from '../test/renderApp';

describe('the round + button', () => {
  it.each(['/', '/diary', '/progress', '/reports'])('is on %s', async (path) => {
    await renderApp(path);
    expect(await screen.findByRole('button', { name: ru.add.fab })).toBeVisible();
  });

  it('is not on the "Ещё" tab', async () => {
    await renderApp('/more');
    expect(await screen.findByRole('heading', { name: ru.more.title })).toBeVisible();
    expect(screen.queryByRole('button', { name: ru.add.fab })).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ru } from '../i18n/ru';
import { ErrorPage } from './ErrorPage';

describe('error page', () => {
  it('is in Russian, with the two ways out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <ErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: ru.errorPage.title })).toBeVisible();
    expect(screen.getByRole('link', { name: ru.errorPage.home })).toBeVisible();
    expect(screen.getByRole('button', { name: ru.errorPage.update })).toBeVisible();
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
  });
});

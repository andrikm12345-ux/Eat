import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../routes';
import { seedOnboarded } from './seed';

export async function renderApp(initialPath = '/', opts: { seed?: boolean } = {}) {
  if (opts.seed !== false) await seedOnboarded();
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(<RouterProvider router={router} />);
  return { router, ...utils };
}

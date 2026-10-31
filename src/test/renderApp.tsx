import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../routes';

export function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(<RouterProvider router={router} />);
  return { router, ...utils };
}

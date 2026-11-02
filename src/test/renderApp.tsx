import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { repos } from '../db/repos';
import { routes } from '../routes';
import { ACCOUNT } from '../services/account';
import { seedOnboarded } from './seed';

/**
 * Renders the app. The app needs an account, so the test user is signed in unless the test is
 * about the signed-out state (`signedOut: true`); an existing sign-in is left as it is.
 */
export async function renderApp(
  initialPath = '/',
  opts: { seed?: boolean; signedOut?: boolean } = {},
) {
  if (opts.seed !== false) await seedOnboarded();
  if (!opts.signedOut && !(await repos.settings.get<string>(ACCOUNT.token, ''))) {
    await repos.settings.set(ACCOUNT.token, 'test-token');
    await repos.settings.set(ACCOUNT.login, 'tester');
  }
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(<RouterProvider router={router} />);
  return { router, ...utils };
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ensureBaseFoods } from './db/baseFoods';
import { repos } from './db/repos';
import { routes } from './routes';
import { startAccountSync } from './services/sync';
import { startTdeeSync } from './services/tdeeSync';
import { startGamificationSync } from './services/gamificationSync';
import './styles/global.css';

const router = createBrowserRouter(routes);

// Load the bundled food catalog into IndexedDB (once per catalog version).
void ensureBaseFoods(repos).catch((e: unknown) => console.error('Base foods failed', e));
// Adaptive TDEE + weekly check-in, recomputed on start and on data changes.
startTdeeSync(repos);
// Cloud sync while signed in to an account.
startAccountSync(repos);
// Achievements, streak celebrations and the app icon badge.
startGamificationSync(repos);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

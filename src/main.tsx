import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ensureBaseFoods } from './db/baseFoods';
import { repos } from './db/repos';
import { routes } from './routes';
import { startAccountSync } from './services/sync';
import { startTdeeSync } from './services/tdeeSync';
import { startGamificationSync } from './services/gamificationSync';
import { startTodayWatcher, toast } from './state/ui';
import { startKeyboardWatcher } from './ui/keyboard';
import { ru } from './i18n/ru';
import './styles/fonts.css';
import './styles/tokens.css';
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

// "Сегодня" follows the calendar when the app stays open overnight.
startTodayWatcher();
// No empty strip between the tab bar and the phone keyboard.
startKeyboardWatcher();
// A forgotten error in the background must not pass unnoticed.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection', e.reason);
  // Cancelled requests and interrupted media are not failures.
  if ((e.reason as { name?: string } | undefined)?.name === 'AbortError') return;
  toast({ text: ru.common.somethingWrong });
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

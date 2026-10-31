import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from './ui/AppShell';
import TodayPage from './features/today/TodayPage';

// "Today" is eager so the home screen paints instantly; other tabs are lazy chunks.
const lazyPage = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: TodayPage },
      { path: 'diary', lazy: lazyPage(() => import('./features/diary/DiaryPage')) },
      { path: 'progress', lazy: lazyPage(() => import('./features/progress/ProgressPage')) },
      { path: 'reports', lazy: lazyPage(() => import('./features/reports/ReportsPage')) },
      { path: 'more', lazy: lazyPage(() => import('./features/more/MorePage')) },
      { path: '*', lazy: lazyPage(() => import('./features/NotFoundPage')) },
    ],
  },
];

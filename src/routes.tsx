import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from './ui/AppShell';
import TodayPage from './features/today/TodayPage';

// "Today" is eager so the home screen paints instantly; other tabs are lazy chunks.
const lazyPage = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const routes: RouteObject[] = [
  { path: '/wizard', lazy: lazyPage(() => import('./features/onboarding/WizardPage')) },
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: TodayPage },
      { path: 'diary', lazy: lazyPage(() => import('./features/diary/DiaryPage')) },
      { path: 'progress', lazy: lazyPage(() => import('./features/progress/ProgressPage')) },
      { path: 'reports', lazy: lazyPage(() => import('./features/reports/ReportsPage')) },
      { path: 'more', lazy: lazyPage(() => import('./features/more/MorePage')) },
      { path: 'add/search', lazy: lazyPage(() => import('./features/add/SearchPage')) },
      { path: 'add/food/:id', lazy: lazyPage(() => import('./features/add/PortionPage')) },
      { path: 'add/quick', lazy: lazyPage(() => import('./features/add/QuickPage')) },
      { path: 'add/barcode', lazy: lazyPage(() => import('./features/barcode/BarcodePage')) },
      { path: 'review', lazy: lazyPage(() => import('./features/review/ReviewPage')) },
      { path: 'add/repeat', lazy: lazyPage(() => import('./features/add/RepeatPage')) },
      { path: 'foods', lazy: lazyPage(() => import('./features/foods/FoodsPage')) },
      { path: 'foods/new', lazy: lazyPage(() => import('./features/foods/FoodEditPage')) },
      { path: 'foods/:id/edit', lazy: lazyPage(() => import('./features/foods/FoodEditPage')) },
      { path: 'entry/:id', lazy: lazyPage(() => import('./features/entry/EntryPage')) },
      { path: 'more/profile', lazy: lazyPage(() => import('./features/profile/ProfilePage')) },
      { path: '*', lazy: lazyPage(() => import('./features/NotFoundPage')) },
    ],
  },
];

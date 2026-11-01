import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from './ui/AppShell';
import { ErrorPage } from './ui/ErrorPage';
import TodayPage from './features/today/TodayPage';

// "Today" is eager so the home screen paints instantly; other tabs are lazy chunks.
const lazyPage = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const routes: RouteObject[] = [
  {
    path: '/wizard',
    errorElement: <ErrorPage />,
    lazy: lazyPage(() => import('./features/onboarding/WizardPage')),
  },
  {
    path: '/welcome',
    errorElement: <ErrorPage />,
    lazy: lazyPage(() => import('./features/account/WelcomePage')),
  },
  {
    path: '/account',
    errorElement: <ErrorPage />,
    lazy: lazyPage(() => import('./features/account/AccountPage')),
  },
  {
    path: '/',
    Component: AppShell,
    errorElement: <ErrorPage />,
    children: [
      { index: true, Component: TodayPage },
      { path: 'diary', lazy: lazyPage(() => import('./features/diary/DiaryPage')) },
      { path: 'progress', lazy: lazyPage(() => import('./features/progress/ProgressPage')) },
      {
        path: 'progress/measurements',
        lazy: lazyPage(() => import('./features/progress/MeasurementsPage')),
      },
      { path: 'progress/photos', lazy: lazyPage(() => import('./features/progress/PhotosPage')) },
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
      { path: 'checkin', lazy: lazyPage(() => import('./features/checkin/CheckinPage')) },
      { path: 'recipes', lazy: lazyPage(() => import('./features/recipes/RecipesPage')) },
      { path: 'recipes/new', lazy: lazyPage(() => import('./features/recipes/RecipeEditPage')) },
      {
        path: 'recipes/:id/edit',
        lazy: lazyPage(() => import('./features/recipes/RecipeEditPage')),
      },
      {
        path: 'add/recipe',
        lazy: async () => ({
          Component: (await import('./features/recipes/RecipesPage')).PickRecipePage,
        }),
      },
      {
        path: 'add/recipe/:id',
        lazy: lazyPage(() => import('./features/recipes/RecipePortionPage')),
      },
      { path: 'templates', lazy: lazyPage(() => import('./features/templates/TemplatesPage')) },
      {
        path: 'add/template',
        lazy: async () => ({
          Component: (await import('./features/templates/TemplatesPage')).PickTemplatePage,
        }),
      },
      { path: 'workouts', lazy: lazyPage(() => import('./features/workouts/WorkoutsPage')) },
      {
        path: 'workouts/new',
        lazy: async () => ({
          Component: (await import('./features/workouts/WorkoutsPage')).WorkoutNewPage,
        }),
      },
      { path: 'data/csv', lazy: lazyPage(() => import('./features/data/CsvImportPage')) },
      { path: 'add/ai-text', lazy: lazyPage(() => import('./features/ai/AiTextPage')) },
      { path: 'add/ai-photo', lazy: lazyPage(() => import('./features/ai/AiPhotoPage')) },
      { path: 'more/ai', lazy: lazyPage(() => import('./features/ai/AiSettingsPage')) },
      {
        path: 'more/achievements',
        lazy: lazyPage(() => import('./features/gamification/AchievementsPage')),
      },
      {
        path: 'more/reminders',
        lazy: lazyPage(() => import('./features/gamification/RemindersPage')),
      },
      { path: 'data', lazy: lazyPage(() => import('./features/data/DataPage')) },
      { path: 'more/storage', lazy: lazyPage(() => import('./features/data/StoragePage')) },
      { path: 'more/about', lazy: lazyPage(() => import('./features/data/AboutPage')) },
      { path: 'more/profile', lazy: lazyPage(() => import('./features/profile/ProfilePage')) },
      { path: '*', lazy: lazyPage(() => import('./features/NotFoundPage')) },
    ],
  },
];

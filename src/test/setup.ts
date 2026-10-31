import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { db } from '../db/db';
import { toLocalDate } from '../domain/dates';
import { useReview } from '../state/review';
import { useToasts, useUi } from '../state/ui';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  useUi.setState({ date: toLocalDate(new Date()), addSheet: { open: false } });
  useToasts.setState({ toasts: [] });
  useReview.setState({ draft: null });
});

afterEach(() => cleanup());

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { db } from '../db/db';
import { toLocalDate } from '../domain/dates';
import { ru } from '../i18n/ru';
import { useReview } from '../state/review';
import { useToasts, useUi } from '../state/ui';

// The app's texts use non-breaking spaces (150\u00a0г). Testing Library turns them into plain
// spaces in the page text but not in the strings the tests look for, so in tests the
// strings of `ru` get plain spaces (a dedicated test checks the real ones).
const plain = (v: unknown): unknown => {
  if (typeof v === 'string') return v.replaceAll('\u00a0', ' ');
  return v;
};
function plainInPlace(obj: Record<string, unknown>) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') obj[k] = plain(v);
    else if (typeof v === 'function') {
      const fn = v as (...a: unknown[]) => unknown;
      obj[k] = (...a: unknown[]) => plain(fn(...a));
    } else if (v && typeof v === 'object') plainInPlace(v as Record<string, unknown>);
  }
}
plainInPlace(ru as unknown as Record<string, unknown>);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  useUi.setState({ date: toLocalDate(new Date()), addSheet: { open: false }, weighOpen: false });
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

import { Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useProfile } from '../db/hooks';
import { AddSheet } from '../features/add/AddSheet';
import { ru } from '../i18n/ru';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { BottomNav } from './BottomNav';
import { Fab } from './Fab';
import styles from './AppShell.module.css';

/** Manifest shortcut actions (`/?action=…`) that open the add sheet. */
const ADD_ACTIONS = new Set(['add', 'scan']);

export function AppShell() {
  const [addOpen, setAddOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const action = params.get('action');
  // A shortcut action keeps the sheet open until it is closed; then the param is dropped.
  const open = addOpen || (action !== null && ADD_ACTIONS.has(action));

  const clearAction = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('action');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  useEffect(() => {
    // TODO(stage 3/4/5): route `scan` to the scanner and `weigh` to the weight sheet.
    if (action !== null && !ADD_ACTIONS.has(action)) clearAction();
  }, [action, clearAction]);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    if (action !== null) clearAction();
  }, [action, clearAction]);

  const profile = useProfile();
  if (profile === null) return <Navigate to="/wizard" replace />;

  return (
    <>
      <UpdateBanner />
      <main className={styles.main}>
        <Suspense fallback={<div className={styles.loading}>{ru.common.loading}</div>}>
          <Outlet />
        </Suspense>
      </main>
      <Fab onClick={() => setAddOpen(true)} expanded={open} />
      <BottomNav />
      <AddSheet open={open} onClose={closeAdd} />
    </>
  );
}

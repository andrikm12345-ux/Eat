import { Suspense, useCallback, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useProfile } from '../db/hooks';
import { AddSheet } from '../features/add/AddSheet';
import { WeighSheet } from '../features/weight/WeighSheet';
import { ru } from '../i18n/ru';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { useUi } from '../state/ui';
import { BottomNav } from './BottomNav';
import { ToastHost } from './ToastHost';
import { Confetti } from './Confetti';
import { useOpenNotifications } from '../pwa/useOpenNotifications';
import { Fab } from './Fab';
import styles from './AppShell.module.css';

/** Manifest shortcut actions (`/?action=…`) that open the add sheet. */
/** The floating "+" only lives on the main tabs; form screens keep their own buttons clear. */
const MAIN_TABS = new Set(['/', '/diary', '/progress', '/reports', '/more']);
const ADD_ACTIONS = new Set(['add']);

export function AppShell() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const action = params.get('action');
  const addOpen = useUi((s) => s.addSheet.open);
  const openAdd = useUi((s) => s.openAdd);
  const setWeighOpen = useUi((s) => s.setWeighOpen);

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
    if (action === null) return;
    if (ADD_ACTIONS.has(action)) openAdd();
    if (action === 'weigh') setWeighOpen(true);
    if (action === 'scan') navigate('/add/barcode', { replace: true });
    else clearAction();
  }, [action, clearAction, openAdd, navigate, setWeighOpen]);

  useOpenNotifications();
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
      {MAIN_TABS.has(pathname) && <Fab onClick={() => openAdd()} expanded={addOpen} />}
      <BottomNav />
      <AddSheet />
      <WeighSheet />
      <ToastHost />
      <Confetti />
    </>
  );
}

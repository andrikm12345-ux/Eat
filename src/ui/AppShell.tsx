import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense, useCallback, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useProfile } from '../db/hooks';
import { repos } from '../db/repos';
import { ACCOUNT } from '../services/account';
import { AddSheet } from '../features/add/AddSheet';
import { WeighSheet } from '../features/weight/WeighSheet';
import { ru } from '../i18n/ru';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { useUi } from '../state/ui';
import { BackBar } from './BackBar';
import { ADD_TABS, MAIN_TABS } from './nav';
import { BottomNav } from './BottomNav';
import { ToastHost } from './ToastHost';
import { Confetti } from './Confetti';
import { useOpenNotifications } from '../pwa/useOpenNotifications';
import { Fab } from './Fab';
import styles from './AppShell.module.css';

/** Manifest shortcut actions (`/?action=…`) that open the add sheet. */
/** The floating "+" only lives on the main tabs; form screens keep their own buttons clear. */
/** The floating "+" lives on Today and Diary only: elsewhere it only covers content. */
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
  // A new visitor first signs in or creates an account (or explicitly skips it).
  const entered = useLiveQuery(async () => {
    const [token, skipped] = await Promise.all([
      repos.settings.get<string>(ACCOUNT.token, ''),
      repos.settings.get<boolean>(ACCOUNT.skipped, false),
    ]);
    return !!token || skipped;
  }, []);
  if (profile === null) {
    if (entered === undefined) return null;
    return <Navigate to={entered ? '/wizard' : '/welcome'} replace />;
  }

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" />
      <UpdateBanner />
      <main className={styles.main}>
        {!MAIN_TABS.has(pathname) && <BackBar />}
        <Suspense
          fallback={
            <div className={styles.loading} aria-label={ru.common.loading} role="status">
              <div className="skeleton" style={{ height: 34, width: '55%', marginBottom: 18 }} />
              <div className="skeleton" style={{ height: 180, marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          }
        >
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </Suspense>
      </main>
      {ADD_TABS.has(pathname) && <Fab onClick={() => openAdd()} expanded={addOpen} />}
      <BottomNav />
      <AddSheet />
      <WeighSheet />
      <ToastHost />
      <Confetti />
    </>
  );
}

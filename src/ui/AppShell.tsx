import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router';
import { useProfile } from '../db/hooks';
import { repos } from '../db/repos';
import { ACCOUNT } from '../services/account';
import { AddSheet } from '../features/add/AddSheet';
import { WeighSheet } from '../features/weight/WeighSheet';
import { UpdateBanner } from '../pwa/UpdateBanner';
import { useUi } from '../state/ui';
import { BackBar } from './BackBar';
import { ADD_TABS, MAIN_TABS } from './nav';
import { Loading } from './states';
import { BottomNav } from './BottomNav';
import { ToastHost } from './ToastHost';
import { AchievementCard } from './AchievementCard';
import { Confetti } from './Confetti';
import { useOpenNotifications } from '../pwa/useOpenNotifications';
import { Fab } from './Fab';
import { useGoBack } from './useGoBack';
import { useSwipeBack } from './useSwipeBack';
import styles from './AppShell.module.css';

/** Manifest shortcut actions (`/?action=…`) that open the add sheet. */
/** The floating "+" lives on every main tab except "Ещё"; form screens keep their own buttons clear. */
const ADD_ACTIONS = new Set(['add']);

function pageClass(pathname: string, navType: string) {
  if (MAIN_TABS.has(pathname)) return 'page-tab';
  return navType === 'POP' ? 'page-back' : 'page-fwd';
}

export function AppShell() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const action = params.get('action');
  const addOpen = useUi((s) => s.addSheet.open);
  const openAdd = useUi((s) => s.openAdd);
  const setWeighOpen = useUi((s) => s.setWeighOpen);
  const mainRef = useRef<HTMLElement>(null);
  const goBack = useGoBack();

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
  // The app needs an account: whoever is not signed in is sent to sign in or create one.
  // (The data on the device stays; signing in merges it with the cloud copy.)
  const signedIn = useLiveQuery(
    async () => !!(await repos.settings.get<string>(ACCOUNT.token, '')),
    [],
  );
  // A swipe to the right anywhere goes back, except on the five tabs and the wizard screens.
  const swipeBack =
    !!signedIn &&
    profile !== null &&
    !MAIN_TABS.has(pathname) &&
    !['/wizard', '/welcome'].includes(pathname);
  useSwipeBack(mainRef, swipeBack, goBack);
  if (signedIn === undefined) return null;
  if (!signedIn) return <Navigate to="/welcome" replace />;
  if (profile === null) return <Navigate to="/wizard" replace />;

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" />
      <UpdateBanner />
      <main ref={mainRef} className={styles.main}>
        {!MAIN_TABS.has(pathname) && <BackBar />}
        <Suspense
          fallback={
            <div className={styles.loading}>
              <Loading />
            </div>
          }
        >
          <div key={pathname} className={pageClass(pathname, navType)}>
            <Outlet />
          </div>
        </Suspense>
      </main>
      <BottomNav
        fab={ADD_TABS.has(pathname) ? <Fab onClick={() => openAdd()} expanded={addOpen} /> : null}
      />
      <AddSheet />
      <WeighSheet />
      <ToastHost />
      <Confetti />
      <AchievementCard />
    </>
  );
}

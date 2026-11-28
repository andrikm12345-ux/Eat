/**
 * A guard for an iOS quirk of the home-screen app: when the phone resumes it from the background,
 * the web view sometimes comes back with the wrong size: the page shifted sideways, zoomed, or
 * with an unpainted white strip below. Closing and opening the app fixes it, so this does the
 * same by itself: on resume it measures the layout; if it is off it first nudges the browser to
 * lay the page out again, and if that does not help it reloads the page (the data lives in the
 * database of the device and in the cloud, nothing is lost).
 *
 * It only works in the installed (standalone) app and reloads at most once every 30 seconds.
 */
export type Metrics = {
  innerW: number;
  innerH: number;
  /** documentElement.clientWidth / clientHeight / scrollWidth. */
  clientW: number;
  clientH: number;
  scrollW: number;
  /** Visual viewport, when the browser has one. */
  vv: { offsetLeft: number; scale: number } | null;
  keyboardOpen: boolean;
};

const SIDE_TOLERANCE = 3;
const STRIP_TOLERANCE = 80;

/** True when the measurements cannot belong to a healthy layout. */
export function layoutBroken(m: Metrics): boolean {
  if (m.scrollW > m.innerW + SIDE_TOLERANCE) return true; // wider than the screen: sideways shift
  if (Math.abs(m.clientW - m.innerW) > 24) return true; // the page is not as wide as the window
  if (m.vv && (Math.abs(m.vv.offsetLeft) > SIDE_TOLERANCE || Math.abs(m.vv.scale - 1) > 0.01))
    return true; // panned or zoomed
  // A blank strip: the page is shorter than the window (the keyboard legitimately shrinks it).
  if (!m.keyboardOpen && m.clientH < m.innerH - STRIP_TOLERANCE) return true;
  return false;
}

export type Env = {
  standalone: () => boolean;
  metrics: () => Metrics;
  /** Makes the browser lay the page out and paint it again. */
  nudge: () => void;
  reload: () => void;
  now: () => number;
  lastReload: { get: () => number; set: (t: number) => void };
};

const RELOAD_GAP_MS = 30_000;
const FIRST_CHECK_MS = 300;
const SECOND_CHECK_MS = 1000;

/** The check itself, with everything it touches passed in (testable). Returns a stop function. */
export function startResumeGuard(env: Env, doc: Document = document): () => void {
  const timers: number[] = [];
  const clear = () => {
    timers.splice(0).forEach((t) => window.clearTimeout(t));
  };
  const check = () => {
    if (!env.standalone() || !layoutBroken(env.metrics())) return;
    env.nudge();
    timers.push(
      window.setTimeout(() => {
        if (!layoutBroken(env.metrics())) return;
        const t = env.now();
        if (t - env.lastReload.get() < RELOAD_GAP_MS) return;
        env.lastReload.set(t);
        env.reload();
      }, SECOND_CHECK_MS),
    );
  };
  const onResume = () => {
    clear();
    timers.push(window.setTimeout(check, FIRST_CHECK_MS));
  };
  const onVisible = () => {
    if (doc.visibilityState === 'visible') onResume();
  };
  doc.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onResume);
  window.addEventListener('orientationchange', onResume);
  return () => {
    clear();
    doc.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onResume);
    window.removeEventListener('orientationchange', onResume);
  };
}

/** The real browser wiring. */
export function browserEnv(): Env {
  const KEY = 'resumeGuardReloadAt';
  return {
    standalone: () =>
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true,
    metrics: () => {
      const el = document.documentElement;
      const vv = window.visualViewport;
      return {
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        clientW: el.clientWidth,
        clientH: el.clientHeight,
        scrollW: el.scrollWidth,
        vv: vv ? { offsetLeft: vv.offsetLeft, scale: vv.scale } : null,
        keyboardOpen: el.dataset.kbd === '1',
      };
    },
    nudge: () => {
      window.scrollTo(0, window.scrollY);
      const body = document.body;
      body.style.transform = 'translateZ(0)';
      void body.offsetHeight;
      body.style.transform = '';
      window.dispatchEvent(new Event('resize'));
    },
    reload: () => window.location.reload(),
    now: () => Date.now(),
    lastReload: {
      get: () => {
        try {
          return Number(window.localStorage.getItem(KEY)) || 0;
        } catch {
          return 0;
        }
      },
      set: (t) => {
        try {
          window.localStorage.setItem(KEY, String(t));
        } catch {
          /* private mode: the guard still reloads at most once per page life */
        }
      },
    },
  };
}

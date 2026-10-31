import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ru } from '../i18n/ru';
import styles from './UpdateBanner.module.css';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Periodically look for a new version while the app stays open.
      if (registration) {
        setInterval(() => {
          if (navigator.onLine) void registration.update();
        }, UPDATE_CHECK_MS);
      }
    },
  });

  // The service worker activates a new version by itself; once it takes over, the page
  // still runs the old code until reloaded, so offer a reload.
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw?.controller) return; // first install: nothing was replaced
    const onChange = () => setTaken(true);
    sw.addEventListener('controllerchange', onChange);
    return () => sw.removeEventListener('controllerchange', onChange);
  }, []);

  if (taken) {
    return (
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.text}>{ru.pwa.updateAvailable}</span>
        <button type="button" className={styles.button} onClick={() => setTaken(false)}>
          {ru.pwa.later}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => window.location.reload()}
        >
          {ru.pwa.updateAction}
        </button>
      </div>
    );
  }

  if (needRefresh) {
    return (
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.text}>{ru.pwa.updateAvailable}</span>
        <button type="button" className={styles.button} onClick={() => setNeedRefresh(false)}>
          {ru.pwa.later}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => void updateServiceWorker(true)}
        >
          {ru.pwa.updateAction}
        </button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.text}>{ru.pwa.offlineReady}</span>
        <button type="button" className={styles.button} onClick={() => setOfflineReady(false)}>
          {ru.pwa.ok}
        </button>
      </div>
    );
  }

  return null;
}

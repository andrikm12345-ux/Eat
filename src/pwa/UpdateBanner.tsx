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

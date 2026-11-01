import { useToasts } from '../state/ui';
import styles from './ToastHost.module.css';

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${t.leaving ? styles.leaving : ''}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.text}>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                dismiss(t.id);
                void t.action?.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

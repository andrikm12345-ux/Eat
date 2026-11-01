import { Link, useRouteError } from 'react-router';
import { ru } from '../i18n/ru';
import { forceUpdate } from '../pwa/forceUpdate';
import styles from './ErrorPage.module.css';

const t = ru.errorPage;

/** Shown when a screen crashes: own text instead of the framework's English page. */
export function ErrorPage() {
  const error = useRouteError();
  if (error) console.error('Screen crashed', error);
  return (
    <main className={styles.wrap} role="alert">
      <svg className={styles.art} viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" className={styles.disc} />
        <path d="M60 34v32" className={styles.stroke} />
        <circle cx="60" cy="82" r="3.5" className={styles.fill} />
      </svg>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.text}>{t.text}</p>
      <div className={styles.actions}>
        <Link to="/" className={styles.primary} reloadDocument>
          {t.home}
        </Link>
        <button type="button" className={styles.secondary} onClick={() => void forceUpdate()}>
          {t.update}
        </button>
      </div>
    </main>
  );
}

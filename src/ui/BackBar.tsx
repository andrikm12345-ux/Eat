import { useLocation, useNavigate } from 'react-router';
import { ru } from '../i18n/ru';
import styles from './BackBar.module.css';

/** In-app back arrow for secondary screens (falls back to "Сегодня" without history). */
export function BackBar() {
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.back}
        aria-label={ru.common.back}
        onClick={() => (key === 'default' ? navigate('/', { replace: true }) : navigate(-1))}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {ru.common.back}
      </button>
    </div>
  );
}

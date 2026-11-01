import { useLocation, useNavigate } from 'react-router';
import { ru } from '../i18n/ru';
import { IconBack } from './icons';
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
        <IconBack />
        {ru.common.back}
      </button>
    </div>
  );
}

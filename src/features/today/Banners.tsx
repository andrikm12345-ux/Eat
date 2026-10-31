import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { toLocalDate } from '../../domain/dates';
import { measurementDue } from '../../domain/reminders';
import { repos } from '../../db/repos';
import { bannerDismissKey, SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import styles from './banners.module.css';

type Banner = { id: string; text: string; action?: { label: string; to: string } };

/** In-app reminders shown when the app is opened (closable for the day). */
export function Banners() {
  const today = toLocalDate(new Date());
  const banners = useLiveQuery(async () => {
    const out: Banner[] = [];
    const dismissed = async (id: string) => repos.settings.get(bannerDismissKey(id, today), false);

    const weekday = await repos.settings.get(
      SETTINGS.measureWeekday.key,
      SETTINGS.measureWeekday.def,
    );
    const last =
      (await repos.measurements.list())
        .map((m) => m.date)
        .sort()
        .at(-1) ?? null;
    if (measurementDue(today, weekday, last) && !(await dismissed('measure'))) {
      out.push({
        id: 'measure',
        text: ru.banners.measure,
        action: { label: ru.banners.measureAction, to: '/progress/measurements' },
      });
    }
    return out;
  }, [today]);

  if (!banners?.length) return null;
  return (
    <div className={styles.list}>
      {banners.map((b) => (
        <div key={b.id} className={styles.banner} role="status">
          <span className={styles.text}>{b.text}</span>
          {b.action && (
            <Link to={b.action.to} className={styles.action}>
              {b.action.label}
            </Link>
          )}
          <button
            type="button"
            className={styles.close}
            aria-label={ru.banners.close}
            onClick={() => void repos.settings.set(bannerDismissKey(b.id, today), true)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { toLocalDate } from '../../domain/dates';
import { backupDue, breakfastMissing, measurementDue, weighOverdue } from '../../domain/reminders';
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
    {
      const todayEntries = await repos.entries.byDate(today);
      const now = new Date();
      if (
        breakfastMissing(
          now.getHours() * 60 + now.getMinutes(),
          todayEntries.map((e) => e.time),
        ) &&
        !(await dismissed('breakfast'))
      ) {
        out.push({
          id: 'breakfast',
          text: ru.banners.breakfast,
          action: { label: ru.banners.breakfastAction, to: '/add/search' },
        });
      }
      const lastW = (await repos.weights.latest())?.date ?? null;
      const overdue = weighOverdue(lastW, today);
      if (overdue !== null && !(await dismissed('weigh'))) {
        out.push({
          id: 'weigh',
          text: ru.banners.weigh(overdue),
          action: { label: ru.banners.weighAction, to: '/?action=weigh' },
        });
      }
      const lastBackup =
        (await repos.settings.get(SETTINGS.lastBackupAt.key, SETTINGS.lastBackupAt.def)).slice(
          0,
          10,
        ) || null;
      const firstUse =
        (await repos.goals.list()).map((g) => g.createdAt.slice(0, 10)).sort()[0] ?? null;
      if (backupDue(lastBackup, firstUse, today) && !(await dismissed('backup'))) {
        out.push({
          id: 'backup',
          text: ru.banners.backup,
          action: { label: ru.banners.backupAction, to: '/data' },
        });
      }
    }
    const pending = await repos.checkins.where('status', 'pending');
    if (pending.length && !(await dismissed('checkin'))) {
      out.unshift({
        id: 'checkin',
        text: ru.checkin.banner,
        action: { label: ru.checkin.open, to: '/checkin' },
      });
    }
    return out;
  }, [today]);

  if (!banners?.length) return null;
  // One reminder at a time: closing it shows the next one.
  const shown = banners.slice(0, 1);
  const waiting = banners.length - shown.length;
  return (
    <div className={styles.list}>
      {shown.map((b) => (
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
            aria-label={`${ru.banners.close}: ${b.text}`}
            onClick={() => void repos.settings.set(bannerDismissKey(b.id, today), true)}
          >
            ×
          </button>
        </div>
      ))}
      {waiting > 0 && <p className={styles.more}>{ru.banners.more(waiting)}</p>}
    </div>
  );
}

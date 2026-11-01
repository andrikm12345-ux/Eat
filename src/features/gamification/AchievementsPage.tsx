import { useLiveQuery } from 'dexie-react-hooks';
import { ACHIEVEMENTS } from '../../domain/achievements';
import { formatDateRu, toLocalDate } from '../../domain/dates';
import { FREEZES_PER_MONTH } from '../../domain/streaks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { buildAchievementCtx, loadStreaks } from '../../services/gamification';
import { Card, Collapsible, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import todayStyles from '../today/today.module.css';
import { Loading } from '../../ui/states';

const t = ru.achievements;

export default function AchievementsPage() {
  const today = toLocalDate(new Date());
  const data = useLiveQuery(async () => {
    const [rows, ctx, streaks] = await Promise.all([
      repos.db.achievements.toArray(),
      buildAchievementCtx(repos, today),
      loadStreaks(repos, today),
    ]);
    return { got: new Map(rows.map((r) => [r.id, r])), ctx, streaks };
  }, [today]);
  if (!data)
    return (
      <Page title={t.title}>
        <Loading />
      </Page>
    );
  const { streaks } = data;
  const unlocked = ACHIEVEMENTS.filter((a) => data.got.has(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !data.got.has(a.id));
  const renderRows = (list: typeof ACHIEVEMENTS) =>
    list.map((a) => {
      const row = data.got.get(a.id);
      const res = a.check(data.ctx);
      const title =
        a.id === 'path' && row
          ? ru.achievements.level(a.title, String((row.progress ?? 0) * 2.5).replace('.', ','))
          : a.title;
      return (
        <li key={a.id} className={`${styles.row} ${row ? '' : styles.lockedRow}`}>
          <div className={styles.rowLink}>
            <span aria-hidden="true" style={{ fontSize: 'var(--fs-3)' }}>
              {row ? '★' : '☆'}
            </span>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{title}</span>
              <span className={styles.rowSub}>
                {row ? t.unlockedAt(formatDateRu(row.unlockedAt.slice(0, 10))) : a.description}
              </span>
              {!row && (
                <div
                  className={todayStyles.bar}
                  style={{ marginTop: 'var(--sp-1)' }}
                  role="meter"
                  aria-label={a.title}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(res.progress * 100)}
                >
                  <div
                    className={todayStyles.barFill}
                    style={{ width: `${Math.round(res.progress * 100)}%` }}
                  />
                </div>
              )}
            </span>
          </div>
        </li>
      );
    });
  return (
    <Page title={t.title}>
      <Card>
        <Stat
          label={t.streak}
          value={`${t.days(streaks.log.current)} · ${t.best(streaks.log.best)}`}
        />
        <Stat
          label={t.weighStreak}
          value={`${t.days(streaks.weigh.current)} · ${t.best(streaks.weigh.best)}`}
        />
        <p className={styles.muted}>{t.freezes(FREEZES_PER_MONTH - streaks.log.freezesUsed)}</p>
        <p className={styles.muted}>{t.streakHint}</p>
      </Card>
      {unlocked.length > 0 && <ul className={styles.list}>{renderRows(unlocked)}</ul>}
      {locked.length > 0 && (
        <Collapsible title={t.upcoming(locked.length)}>
          <ul className={styles.list} style={{ boxShadow: 'none' }}>
            {renderRows(locked)}
          </ul>
        </Collapsible>
      )}
    </Page>
  );
}

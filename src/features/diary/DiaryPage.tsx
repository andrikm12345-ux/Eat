import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { addDays, formatDateRu, parseLocalDate, toLocalDate, weekStart } from '../../domain/dates';
import { dayStatus } from '../../domain/day';
import { formatKcal } from '../../domain/format';
import { goalFor } from '../../domain/goals';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { Switch } from '../../ui/kit';
import { Page } from '../../ui/Page';
import listStyles from '../add/add.module.css';
import styles from './diary.module.css';
import { EmptyState } from '../../ui/states';

const t = ru.diary;
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const shiftMonth = (first: string, n: number) => {
  const d = parseLocalDate(first);
  return toLocalDate(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

export default function DiaryPage() {
  const selected = useUi((s) => s.date);
  const setDate = useUi((s) => s.setDate);
  const openAdd = useUi((s) => s.openAdd);
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthStart(selected));
  const [onlyComplete, setOnlyComplete] = useState(false);
  const [onlyWorkouts, setOnlyWorkouts] = useState(false);
  const last = addDays(shiftMonth(month, 1), -1);
  const today = toLocalDate(new Date());

  const data = useLiveQuery(async () => {
    const [entries, goals, metas, workouts] = await Promise.all([
      repos.entries.inRange(month, last),
      repos.goals.list(),
      repos.db.dayMeta.where('date').between(month, last, true, true).toArray(),
      repos.workouts.list(),
    ]);
    const kcal = new Map<string, number>();
    for (const e of entries) kcal.set(e.date, (kcal.get(e.date) ?? 0) + e.totals.kcal);
    return {
      kcal,
      goals,
      complete: new Set(metas.filter((m) => m.complete && !m.deletedAt).map((m) => m.date)),
      workoutDays: new Set(workouts.map((w) => w.date)),
    };
  }, [month, last]);

  const cells: (string | null)[] = [];
  const first = weekStart(month);
  for (let d = first; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) {
    cells.push(d < month || d > last ? null : d);
  }

  const visible = (d: string) =>
    !!data && (!onlyComplete || data.complete.has(d)) && (!onlyWorkouts || data.workoutDays.has(d));

  const open = (d: string) => {
    setDate(d);
    navigate('/');
  };

  const days = data ? [...data.kcal.keys()].filter(visible).sort((a, b) => b.localeCompare(a)) : [];

  return (
    <Page title={t.title}>
      <div className={styles.monthBar}>
        <button
          type="button"
          className={listStyles.stepBtn}
          style={{ margin: '0', borderRadius: '50%', width: 44, height: 44, border: 'none' }}
          aria-label={t.prevMonth}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <span className={styles.monthTitle}>{formatDateRu(month, 'LLLL yyyy')}</span>
        <button
          type="button"
          className={listStyles.stepBtn}
          style={{ margin: '0', borderRadius: '50%', width: 44, height: 44, border: 'none' }}
          aria-label={t.nextMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      <div className={styles.grid}>
        {DOW.map((d) => (
          <span key={d} className={styles.dow}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const kcal = data?.kcal.get(d) ?? 0;
          const status = visible(d)
            ? dayStatus(kcal, data ? goalFor(data.goals, d)?.kcal : undefined)
            : 'empty';
          const cls = [
            styles.cell,
            status !== 'empty' ? styles[status] : '',
            d === today ? styles.today : '',
            d > today ? styles.future : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={d}
              type="button"
              className={cls}
              onClick={() => open(d)}
              aria-label={formatDateRu(d)}
            >
              {parseLocalDate(d).getDate()}
            </button>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={`${styles.swatch} ${styles.close}`} />
          {t.legendClose}
        </span>
        <span>
          <i className={`${styles.swatch} ${styles.below}`} />
          {t.legendBelow}
        </span>
        <span>
          <i className={`${styles.swatch} ${styles.above}`} />
          {t.legendAbove}
        </span>
      </div>
      <Switch label={t.onlyComplete} checked={onlyComplete} onChange={setOnlyComplete} />
      <Switch label={t.onlyWorkouts} checked={onlyWorkouts} onChange={setOnlyWorkouts} />
      <h2 className={listStyles.sectionTitle}>{t.days}</h2>
      {days.length === 0 ? (
        <EmptyState
          kind="diary"
          text={t.empty}
          action={{ label: t.addEntry, onClick: () => openAdd() }}
        />
      ) : (
        <ul className={listStyles.list}>
          {days.map((d) => {
            const goal = data ? goalFor(data.goals, d)?.kcal : undefined;
            const kcal = data?.kcal.get(d) ?? 0;
            return (
              <li key={d} className={listStyles.row}>
                <button type="button" className={listStyles.rowLink} onClick={() => open(d)}>
                  <span className={listStyles.rowMain}>
                    <span className={listStyles.rowName}>{formatDateRu(d, 'EEEE, d MMMM')}</span>
                    <span className={listStyles.rowSub}>
                      {goal
                        ? t.kcalOfGoal(formatKcal(kcal), formatKcal(goal))
                        : `${formatKcal(kcal)} ккал`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

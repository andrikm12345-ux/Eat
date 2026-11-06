import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addDays, formatDateRu, toLocalDate, weekStart } from '../../domain/dates';
import { dayStatus } from '../../domain/day';
import { formatKcal } from '../../domain/format';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadWeekReport, type WeekReport } from '../../services/reports';
import { Segmented } from '../../ui/kit';
import { Page } from '../../ui/Page';
import sky from '../../ui/sky/sky.module.css';
import { EnergyCard } from '../progress/EnergyCard';
import { MicroView } from './MicroView';
import { TdeeChart } from './TdeeChart';
import { WeekReportView } from './WeekReportView';
import styles from './reports.module.css';

const t = ru.reports;
type Tab = 'week' | 'energy' | 'micro';
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('week');
  const today = toLocalDate(new Date());
  const [ws, setWs] = useState(weekStart(today));
  const data = useLiveQuery(() => loadWeekReport(repos, ws), [ws]);
  return (
    <Page
      title={t.title}
      hero={
        <>
          <div className={sky.navRow}>
            <button
              type="button"
              className={sky.arrow}
              aria-label={t.prevWeek}
              onClick={() => setWs(addDays(ws, -7))}
            >
              ‹
            </button>
            <strong>
              {t.weekRange(formatDateRu(ws, 'd MMM'), formatDateRu(addDays(ws, 6), 'd MMM'))}
            </strong>
            <button
              type="button"
              className={sky.arrow}
              aria-label={t.nextWeek}
              onClick={() => setWs(addDays(ws, 7))}
              disabled={addDays(ws, 7) > today}
            >
              ›
            </button>
          </div>
          {data && <WeekBars w={data} today={today} />}
        </>
      }
    >
      <Segmented
        label={t.tab}
        value={tab}
        onChange={setTab}
        options={(['week', 'energy', 'micro'] as const).map((v) => ({
          value: v,
          label: t.tabs[v],
        }))}
      />
      {tab === 'week' && <WeekReportView data={data} />}
      {tab === 'energy' && (
        <>
          <TdeeChart />
          <EnergyCard />
        </>
      )}
      {tab === 'micro' && <MicroView />}
    </Page>
  );
}

/** Seven bars on the sky: green near the goal, yellow under it, orange over it. */
function WeekBars({ w, today }: { w: WeekReport; today: string }) {
  const max = Math.max(1, ...w.dayKcal.map((d) => Math.max(d.kcal, d.goal ?? 0))) * 1.08;
  const goals = w.dayKcal.map((d) => d.goal).filter((g): g is number => g !== null);
  const goal = goals.length ? goals.reduce((a, b) => a + b, 0) / goals.length : null;
  const inGoal = w.dayKcal.filter((d) => dayStatus(d.kcal, d.goal ?? undefined) === 'close').length;
  return (
    <>
      <div className={styles.bars} role="img" aria-label={t.bars}>
        {goal !== null && (
          <i
            className={styles.goalLine}
            style={{ bottom: `calc(20px + ${(goal / max) * 120}px)` }}
          />
        )}
        {w.dayKcal.map((d, i) => {
          const status = dayStatus(d.kcal, d.goal ?? undefined);
          return (
            <div
              key={d.date}
              className={styles.col}
              title={t.barDay(DOW[i] as string, formatKcal(d.kcal))}
            >
              <div className={styles.track}>
                <span
                  className={`${styles.bar} ${styles[status]}`}
                  style={{
                    height: `${(d.kcal / max) * 100}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <small className={d.date === today ? styles.todayDow : ''}>{DOW[i]}</small>
            </div>
          );
        })}
      </div>
      {w.loggedDays > 0 && (
        <p className={sky.sub}>
          {t.heroAvg(formatKcal(w.avg.kcal))}
          {goal !== null && <> · {t.heroInGoal(inGoal)}</>}
        </p>
      )}
    </>
  );
}

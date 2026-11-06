import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { formatKg, formatRate } from '../../domain/format';
import { forecastDate, goalProgress, trendRatePerWeek } from '../../domain/progress';
import { trendOn, type TrendPoint } from '../../domain/weightTrend';
import type { Goal, Weight } from '../../domain/types';
import { useGoalFor, useGoals } from '../../db/hooks';
import { pathStart } from '../../services/gamification';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { toast, useUi } from '../../state/ui';
import { Link } from 'react-router';
import { Button, Card, Collapsible, Segmented } from '../../ui/kit';
import { IconCamera, IconScale } from '../../ui/icons';
import { Sparkline } from './Sparkline';
import { Page } from '../../ui/Page';
import listStyles from '../add/add.module.css';
import { useTrend } from './useTrend';
import { WeightChart } from './WeightChart';
import sky from '../../ui/sky/sky.module.css';
import styles from './progress.module.css';
import { Loading } from '../../ui/states';

const t = ru.progress;
type Period = 'm1' | 'm3' | 'm6' | 'all';
const DAYS: Record<Exclude<Period, 'all'>, number> = { m1: 30, m3: 91, m6: 182 };

export default function ProgressPage() {
  const today = toLocalDate(new Date());
  const data = useTrend();
  const goal = useGoalFor(today);
  const setWeighOpen = useUi((s) => s.setWeighOpen);
  const [period, setPeriod] = useState<Period>('m1');
  if (!data || goal === undefined)
    return (
      <Page title={t.title}>
        <Loading />
      </Page>
    );
  const first = data.points[0]?.date ?? today;
  const from = period === 'all' ? first : addDays(today, -DAYS[period]);

  return (
    <Page title={t.title} hero={<ProgressHero points={data.points} goal={goal} today={today} />}>
      <Card title={t.chart} tone="sky">
        <Segmented
          label={t.period}
          value={period}
          onChange={setPeriod}
          options={(['m1', 'm3', 'm6', 'all'] as const).map((p) => ({
            value: p,
            label: t.periods[p],
          }))}
        />
        <WeightChart
          points={data.points}
          from={from < first && period === 'all' ? first : from}
          to={today}
        />
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <Button block variant="secondary" onClick={() => setWeighOpen(true)}>
            {ru.weight.weigh}
          </Button>
        </div>
      </Card>
      <GoalScale points={data.points} goal={goal} today={today} />
      <div className={styles.tiles}>
        <Link to="/progress/measurements" className={`${styles.tile} ${styles.tileWater}`}>
          <span className={styles.tileIcon}>
            <IconScale />
          </span>
          {t.measurements}
        </Link>
        <Link to="/progress/photos" className={`${styles.tile} ${styles.tileRose}`}>
          <span className={styles.tileIcon}>
            <IconCamera />
          </span>
          {t.photos}
        </Link>
      </div>
      <WeightHistory weights={data.weights} />
      <TrendSettings alpha={data.alpha} pick={data.pick} />
    </Page>
  );
}

/** On the sky: the trend weight now, the goal, the change over a month and the line itself. */
function ProgressHero({
  points,
  goal,
  today,
}: {
  points: TrendPoint[];
  goal: Goal | null;
  today: string;
}) {
  const h = t.hero;
  const now = trendOn(points, today);
  if (now === undefined) return <p className={sky.sub}>{h.none}</p>;
  const monthAgo = addDays(today, -30);
  const recent = points.filter((p) => p.date >= monthAgo);
  const startTrend = trendOn(points, monthAgo) ?? recent[0]?.trend ?? now;
  const change = now - startTrend;
  const target = goal?.targetWeightKg;
  const signedKg =
    Math.abs(change) < 0.05
      ? formatKg(0)
      : `${change > 0 ? '+' : '−'}${formatKg(Math.abs(change))}`;
  const left = target === undefined ? null : Math.abs(now - target);
  return (
    <>
      <p className={styles.heroWeight}>{h.now(formatKg(now))}</p>
      <p className={sky.sub}>
        {target !== undefined && <>{h.goal(formatKg(target))} · </>}
        {h.month(signedKg)}
      </p>
      <Sparkline
        values={
          recent.length >= 2 ? recent.map((p) => p.trend) : points.slice(-30).map((p) => p.trend)
        }
        target={target}
        label={h.chart}
      />
      {left !== null && (
        <p className={styles.heroChip}>{left < 0.1 ? h.reached : h.left(formatKg(left))}</p>
      )}
    </>
  );
}

function GoalScale({
  points,
  goal,
  today,
}: {
  points: TrendPoint[];
  goal: Goal | null;
  today: string;
}) {
  const goals = useGoals();
  const now = trendOn(points, today);
  const target = goal?.targetWeightKg;
  if (!goal || target === undefined) {
    return (
      <Card title={t.goalScale} tone="weight">
        <p className={styles.muted}>{t.noTarget}</p>
      </Card>
    );
  }
  if (now === undefined) return null;
  // Start of the path: trend when this target weight was first set (stable across check-ins).
  const start = pathStart(goals ?? [goal], target, points) ?? (points[0] as TrendPoint).trend;
  const progress = goalProgress(start, now, target);
  const pct = Math.max(0, Math.min(1, progress ?? 1));
  const rate = trendRatePerWeek(points, today);
  const eta = forecastDate(now, target, rate, today);
  return (
    <Card title={t.goalScale} tone="weight">
      <div
        className={styles.scale}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={t.goalScale}
      >
        <div className={styles.scaleFill} style={{ width: `${pct * 100}%` }} />
        <span
          className={styles.scaleNow}
          style={{ left: `${Math.min(90, Math.max(10, pct * 100))}%` }}
        >
          {formatKg(now)}
        </span>
      </div>
      <div className={styles.scaleLabels}>
        <span>
          {t.start} {formatKg(start)}
        </span>
        <span>
          {t.target} {formatKg(target)}
        </span>
      </div>
      <p>{t.pathPct(String(Math.round((progress ?? 1) * 100)))}</p>
      {rate !== null && <p className={styles.muted}>{t.rate(formatRate(rate))}</p>}
      <p className={styles.muted}>{eta ? t.forecast(formatDateRu(eta)) : t.noForecast}</p>
    </Card>
  );
}

function WeightHistory({ weights }: { weights: Weight[] }) {
  const recent = [...weights].reverse().slice(0, 30);
  if (!recent.length) return null;
  return (
    <Collapsible title={t.history}>
      <ul className={listStyles.list}>
        {recent.map((w) => (
          <li key={w.id} className={listStyles.row}>
            <div className={listStyles.rowLink}>
              <span className={listStyles.rowMain}>
                <span className={listStyles.rowName}>{formatKg(w.kg)} кг</span>
                <span className={listStyles.rowSub}>
                  {formatDateRu(w.date, 'd MMMM')} · {w.time}
                </span>
              </span>
              <Button
                variant="text"
                aria-label={`${ru.common.delete}: ${formatKg(w.kg)} кг, ${formatDateRu(w.date)}`}
                onClick={async () => {
                  await repos.weights.softDelete(w.id);
                  toast({
                    text: ru.weight.deleted,
                    action: { label: ru.common.undo, run: () => repos.weights.restore(w.id) },
                  });
                }}
              >
                ×
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

function TrendSettings({ alpha, pick }: { alpha: number; pick: 'first' | 'min' }) {
  const measureDay = useLiveQuery(
    () => repos.settings.get(SETTINGS.measureWeekday.key, SETTINGS.measureWeekday.def),
    [],
  );
  return (
    <Collapsible title={t.trendSettings}>
      <label className={listStyles.muted} htmlFor="alpha">
        {t.alpha}: {String(alpha).replace('.', ',')}
      </label>
      <input
        id="alpha"
        type="range"
        min={0.05}
        max={0.25}
        step={0.01}
        value={alpha}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
        onChange={(e) => void repos.settings.set(SETTINGS.trendAlpha.key, Number(e.target.value))}
      />
      <p className={listStyles.muted}>{t.alphaHint}</p>
      <p className={listStyles.muted}>{t.pick}</p>
      <Segmented
        label={t.pick}
        value={pick}
        onChange={(v) => void repos.settings.set(SETTINGS.weightDailyPick.key, v)}
        options={[
          { value: 'first', label: t.pickFirst },
          { value: 'min', label: t.pickMin },
        ]}
      />
      <label className={listStyles.muted} htmlFor="mday">
        {ru.measure.reminderDay}
      </label>
      <select
        id="mday"
        className={listStyles.input}
        value={measureDay ?? 0}
        onChange={(e) =>
          void repos.settings.set(SETTINGS.measureWeekday.key, Number(e.target.value))
        }
      >
        {ru.measure.weekdays.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </Collapsible>
  );
}

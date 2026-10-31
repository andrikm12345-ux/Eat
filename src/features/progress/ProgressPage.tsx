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
import { Button, Card, LinkButton, Row, Segmented } from '../../ui/kit';
import { Page } from '../../ui/Page';
import listStyles from '../add/add.module.css';
import { EnergyCard } from './EnergyCard';
import { useTrend } from './useTrend';
import { WeightChart } from './WeightChart';
import styles from './progress.module.css';

const t = ru.progress;
type Period = 'm1' | 'm3' | 'm6' | 'all';
const DAYS: Record<Exclude<Period, 'all'>, number> = { m1: 30, m3: 91, m6: 182 };

export default function ProgressPage() {
  const today = toLocalDate(new Date());
  const data = useTrend();
  const goal = useGoalFor(today);
  const setWeighOpen = useUi((s) => s.setWeighOpen);
  const [period, setPeriod] = useState<Period>('m1');
  if (!data || goal === undefined) return <Page title={t.title}>{ru.common.loading}</Page>;
  const first = data.points[0]?.date ?? today;
  const from = period === 'all' ? first : addDays(today, -DAYS[period]);

  return (
    <Page title={t.title}>
      <Card title={t.chart}>
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
        <div style={{ marginTop: 12 }}>
          <Button block variant="secondary" onClick={() => setWeighOpen(true)}>
            {ru.weight.weigh}
          </Button>
        </div>
      </Card>
      <GoalScale points={data.points} goal={goal} today={today} />
      <EnergyCard />
      <Row>
        <LinkButton to="/progress/measurements" variant="secondary">
          {t.measurements}
        </LinkButton>
        <LinkButton to="/progress/photos" variant="secondary">
          {t.photos}
        </LinkButton>
      </Row>
      <div style={{ height: 12 }} />
      <WeightHistory weights={data.weights} />
      <TrendSettings alpha={data.alpha} pick={data.pick} />
    </Page>
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
      <Card title={t.goalScale}>
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
    <Card title={t.goalScale}>
      <div
        className={styles.scale}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={t.goalScale}
      >
        <div className={styles.scaleFill} style={{ width: `${pct * 100}%` }} />
        <span className={styles.scaleNow} style={{ left: `${pct * 100}%` }}>
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
    <>
      <h2 className={listStyles.sectionTitle}>{t.history}</h2>
      <ul className={listStyles.list}>
        {recent.map((w) => (
          <li key={w.id} className={listStyles.row}>
            <div className={listStyles.rowLink}>
              <span className={listStyles.rowMain}>
                <span className={listStyles.rowName}>{formatKg(w.kg)} кг</span>
                <span className={listStyles.rowSub}>
                  {formatDateRu(w.date, 'd MMMM')} · {w.time}
                </span>
              </span>
              <Button
                variant="ghost"
                aria-label={`${ru.common.delete}: ${formatKg(w.kg)} кг, ${formatDateRu(w.date)}`}
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
    </>
  );
}

function TrendSettings({ alpha, pick }: { alpha: number; pick: 'first' | 'min' }) {
  const measureDay = useLiveQuery(
    () => repos.settings.get(SETTINGS.measureWeekday.key, SETTINGS.measureWeekday.def),
    [],
  );
  return (
    <Card title={t.trendSettings}>
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
    </Card>
  );
}

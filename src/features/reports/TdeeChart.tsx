import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, daysBetween, formatDateRu, toLocalDate } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { niceTicks } from '../../domain/progress';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card } from '../../ui/kit';
import listStyles from '../add/add.module.css';
import styles from '../progress/progress.module.css';

const W = 340;
const H = 200;
const PAD = { l: 38, r: 8, t: 10, b: 22 };
/** Half-width of the uncertainty band at zero confidence (kcal). */
const BAND = 300;

export function TdeeChart() {
  const today = toLocalDate(new Date());
  const from = addDays(today, -90);
  const rows = useLiveQuery(
    async () =>
      (await repos.db.tdeeHistory.where('date').between(from, today, true, true).toArray()).sort(
        (a, b) => a.date.localeCompare(b.date),
      ),
    [from, today],
  );
  if (!rows) return null;
  if (rows.length < 2) {
    return (
      <Card title={ru.reports.tdeeChart}>
        <p className={listStyles.muted}>{ru.reports.tdeeEmpty}</p>
      </Card>
    );
  }
  const first = (rows[0] as (typeof rows)[number]).date;
  const span = Math.max(1, daysBetween(first, today));
  const lo = Math.min(...rows.map((r) => r.tdee - (1 - r.confidence) * BAND));
  const hi = Math.max(...rows.map((r) => r.tdee + (1 - r.confidence) * BAND));
  const x = (d: string) => PAD.l + (daysBetween(first, d) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const upper = rows.map(
    (r) => `${x(r.date).toFixed(1)},${y(r.tdee + (1 - r.confidence) * BAND).toFixed(1)}`,
  );
  const lower = [...rows]
    .reverse()
    .map((r) => `${x(r.date).toFixed(1)},${y(r.tdee - (1 - r.confidence) * BAND).toFixed(1)}`);
  const last = rows[rows.length - 1] as (typeof rows)[number];
  return (
    <Card title={ru.reports.tdeeChart}>
      <figure className={styles.chart}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${ru.reports.tdeeChart}: ${formatKcal(last.tdee)} ккал`}
        >
          {niceTicks(lo, hi, 4).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={PAD.l - 4} y={y(v) + 3} className={styles.axis} textAnchor="end">
                {formatKcal(v)}
              </text>
            </g>
          ))}
          <text x={PAD.l} y={H - 6} className={styles.axis}>
            {formatDateRu(first, 'd MMM')}
          </text>
          <text x={W - PAD.r} y={H - 6} className={styles.axis} textAnchor="end">
            {formatDateRu(today, 'd MMM')}
          </text>
          <polygon points={[...upper, ...lower].join(' ')} fill="var(--accent)" opacity={0.15} />
          <polyline
            points={rows.map((r) => `${x(r.date).toFixed(1)},${y(r.tdee).toFixed(1)}`).join(' ')}
            className={styles.line}
          />
        </svg>
      </figure>
      <p className={listStyles.muted}>{ru.reports.tdeeHint}</p>
    </Card>
  );
}

import type React from 'react';
import { addDays, daysBetween, formatDateRu } from '../../domain/dates';
import { formatKg } from '../../domain/format';
import { niceTicks } from '../../domain/progress';
import type { LocalDate } from '../../domain/types';
import type { TrendPoint } from '../../domain/weightTrend';
import { ru } from '../../i18n/ru';
import styles from './progress.module.css';

const W = 340;
const H = 200;
const PAD = { l: 46, r: 8, t: 10, b: 22 };

/** Lightweight SVG chart: raw weigh-ins as dots, EMA trend as a line. */
export function WeightChart({
  points,
  from,
  to,
}: {
  points: TrendPoint[];
  from: LocalDate;
  to: LocalDate;
}) {
  const visible = points.filter((p) => p.date >= from && p.date <= to);
  if (visible.length < 2) return <p className={styles.muted}>{ru.progress.noData}</p>;
  const values = visible.flatMap((p) => [p.kg, p.trend]);
  const min = Math.min(...values) - 0.3;
  const max = Math.max(...values) + 0.3;
  const span = Math.max(1, daysBetween(from, to));
  const x = (d: LocalDate) => PAD.l + (daysBetween(from, d) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const ticks = niceTicks(min, max, 4);
  const line = visible.map((p) => `${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const mid = addDays(from, Math.round(span / 2));
  // Length of the trend line, so CSS can "draw" it from start to end.
  let length = 0;
  for (let i = 1; i < visible.length; i++) {
    const a = visible[i - 1] as TrendPoint;
    const b = visible[i] as TrendPoint;
    length += Math.hypot(x(b.date) - x(a.date), y(b.trend) - y(a.trend));
  }

  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ru.progress.chart}: ${formatKg((visible[0] as TrendPoint).trend)} → ${formatKg((visible[visible.length - 1] as TrendPoint).trend)} кг`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={styles.grid} />
            <text x={PAD.l - 4} y={y(v) + 3} className={styles.axis} textAnchor="end">
              {String(v).replace('.', ',')}
            </text>
          </g>
        ))}
        {[from, mid, to].map((d, i) => (
          <text
            key={d}
            x={x(d)}
            y={H - 6}
            className={styles.axis}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          >
            {formatDateRu(d, 'd MMM')}
          </text>
        ))}
        {visible.map((p, i) => (
          <circle
            key={p.date}
            cx={x(p.date)}
            cy={y(p.kg)}
            r={2.4}
            className={styles.dot}
            style={{ animationDelay: `${Math.round((i / visible.length) * 600)}ms` }}
          />
        ))}
        <polyline
          key={line}
          points={line}
          className={styles.line}
          style={{ '--len': `${Math.ceil(length)}` } as React.CSSProperties}
        />
      </svg>
      <figcaption className={styles.legend}>
        <span>
          <i className={styles.legendDot} /> {ru.progress.legendRaw}
        </span>
        <span>
          <i className={styles.legendLine} /> {ru.progress.legendTrend}
        </span>
      </figcaption>
    </figure>
  );
}

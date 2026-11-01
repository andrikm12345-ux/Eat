import type React from 'react';
import { formatGrams, formatKcal, formatSignedKcal } from '../../domain/format';
import type { DayMeta, Goal, Nutrients } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card, Switch } from '../../ui/kit';
import { useAppeared, useCountUp } from '../../ui/motion';
import { ringFont } from './ringFont';
import styles from './today.module.css';

const t = ru.today;

/** The size follows the FINAL text, so the number does not change size while it counts up. */
function RingValue({
  text,
  over = false,
  children,
}: {
  text: string;
  over?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${styles.ringValue} ${over ? styles.ringOver : ''}`}
      style={{ fontSize: ringFont(text) }}
    >
      {children}
    </span>
  );
}

function CountUp({ value }: { value: number }) {
  return <>{formatKcal(Math.round(useCountUp(value)))}</>;
}
const R = 58;
const C = 2 * Math.PI * R;

function Ring({ eaten, goal }: { eaten: number; goal: number | null }) {
  const appeared = useAppeared();
  const ratio = goal ? eaten / goal : 0;
  const over = goal !== null && eaten > goal;
  const left = goal !== null ? goal - eaten : null;
  return (
    <div className={styles.ring}>
      <svg width="136" height="136" viewBox="0 0 136 136" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--accent-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent)' }} />
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
        <circle
          cx="68"
          cy="68"
          r={R}
          fill="none"
          stroke={over ? 'var(--over)' : 'url(#ring-grad)'}
          strokeWidth="11"
          strokeLinecap="round"
          className={styles.ringArc}
          strokeDasharray={`${appeared ? Math.min(1, ratio) * C : 0} ${C}`}
          transform="rotate(-90 68 68)"
        />
      </svg>
      <div className={styles.ringCenter}>
        {left === null ? (
          <RingValue text={formatKcal(Math.round(eaten))}>
            <CountUp value={eaten} />
          </RingValue>
        ) : over ? (
          <RingValue text={formatSignedKcal(-left)} over>
            {formatSignedKcal(-left)}
          </RingValue>
        ) : (
          <RingValue text={formatKcal(Math.round(left))}>
            <CountUp value={left} />
          </RingValue>
        )}
        <span className={styles.ringLabel}>
          {left === null ? ru.units.kcal : over ? t.over('').trim() : t.left}
        </span>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number | undefined;
  color: string;
}) {
  const appeared = useAppeared();
  const ratio = goal ? value / goal : 0;
  return (
    <div>
      <div className={styles.barLabel}>
        <span>{label}</span>
        <span className={styles.barValue}>
          {goal ? t.macroOf(formatGrams(value), formatGrams(goal)) : `${formatGrams(value)} г`}
        </span>
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal ?? 0}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={`${styles.barFill} ${ratio > 1 ? styles.barOver : ''}`}
          style={{
            width: `${appeared ? Math.min(1, ratio) * 100 : 0}%`,
            ...(ratio > 1 ? {} : { background: color }),
          }}
        />
      </div>
    </div>
  );
}

export function SummaryCard({
  totals,
  goal,
  meta,
}: {
  totals: Nutrients;
  goal: Goal | null;
  meta: DayMeta;
}) {
  return (
    <Card className={styles.hero}>
      <div className={styles.summary}>
        <div>
          <Ring eaten={totals.kcal} goal={goal?.kcal ?? null} />
          <div className={styles.eatenRow}>
            <span>
              {t.eaten} <b>{formatKcal(totals.kcal)}</b>
            </span>
            <span>
              {t.goal} <b>{goal ? formatKcal(goal.kcal) : '—'}</b>
            </span>
          </div>
        </div>
        <div className={styles.bars}>
          <Bar
            label={ru.foods.protein}
            value={totals.protein}
            goal={goal?.protein}
            color="var(--macro-protein)"
          />
          <Bar label={ru.foods.fat} value={totals.fat} goal={goal?.fat} color="var(--macro-fat)" />
          <Bar
            label={ru.foods.carbs}
            value={totals.carbs}
            goal={goal?.carbs}
            color="var(--macro-carbs)"
          />
          <Bar
            label={ru.foods.fiber}
            value={totals.fiber ?? 0}
            goal={goal?.fiber}
            color="var(--macro-fiber)"
          />
        </div>
      </div>
      <Switch
        label={t.complete}
        checked={meta.complete}
        onChange={(v) => void repos.dayMeta.upsert(meta.date, { complete: v })}
      />
    </Card>
  );
}

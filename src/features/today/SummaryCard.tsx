import type React from 'react';
import { formatGrams, formatKcal } from '../../domain/format';
import type { Goal, Nutrients } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { Card } from '../../ui/kit';
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
/** Whole grams in the big number; longer numbers get smaller so a column never overflows. */
const macroFont = (text: string) => (text.length <= 3 ? 26 : text.length <= 5 ? 21 : 17);

const R = 63;
const C = 2 * Math.PI * R;

function Ring({ eaten, goal }: { eaten: number; goal: number | null }) {
  const appeared = useAppeared();
  const ratio = goal ? eaten / goal : 0;
  const over = goal !== null && eaten > goal;
  return (
    <div className={styles.ring}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--accent-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent)' }} />
          </linearGradient>
        </defs>
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          cx="75"
          cy="75"
          r={R}
          fill="none"
          stroke={over ? 'var(--over)' : 'url(#ring-grad)'}
          strokeWidth="12"
          strokeLinecap="round"
          className={styles.ringArc}
          strokeDasharray={`${appeared ? Math.min(1, ratio) * C : 0} ${C}`}
          transform="rotate(-90 75 75)"
        />
      </svg>
      <div className={styles.ringCenter}>
        <RingValue text={formatKcal(Math.round(eaten))} over={over}>
          <CountUp value={eaten} />
        </RingValue>
        <span className={`${styles.ringLabel} ${over ? styles.ringOver : ''}`}>
          {goal !== null ? t.ringOf(formatKcal(goal)) : ru.units.kcal}
        </span>
      </div>
    </div>
  );
}

function Macro({
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
  const over = ratio > 1;
  return (
    <div className={styles.macro}>
      <b
        className={`${styles.macroValue} ${over ? styles.ringOver : ''}`}
        style={{ fontSize: macroFont(formatKcal(value)) }}
      >
        {formatKcal(value)}
      </b>
      <span className={styles.macroOf}>{goal ? t.macroFrom(formatGrams(goal)) : ru.units.g}</span>
      <span className={styles.macroName} style={{ color: over ? 'var(--over-text)' : color }}>
        {label}
      </span>
      <div
        className={styles.bar}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal ?? 0}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={`${styles.barFill} ${over ? styles.barOver : ''}`}
          style={{
            width: `${appeared ? Math.min(1, ratio) * 100 : 0}%`,
            ...(over ? {} : { background: color }),
          }}
        />
      </div>
    </div>
  );
}

/** Fibre is not one of the three columns: its own thin row with a bar, always visible. */
function Fiber({ value, goal }: { value: number; goal: number | undefined }) {
  const appeared = useAppeared();
  const ratio = goal ? value / goal : 0;
  return (
    <div className={styles.fiber}>
      <span className={styles.fiberName}>{ru.foods.fiber}</span>
      <div
        className={styles.bar}
        role="meter"
        aria-label={ru.foods.fiber}
        aria-valuemin={0}
        aria-valuemax={goal ?? 0}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={styles.barFill}
          style={{
            width: `${appeared ? Math.min(1, ratio) * 100 : 0}%`,
            background: 'var(--macro-fiber)',
          }}
        />
      </div>
      <span className={styles.fiberValue}>
        {goal
          ? t.fiberOf(formatGrams(value), formatGrams(goal))
          : `${formatGrams(value)}\u00A0${ru.units.g}`}
      </span>
    </div>
  );
}

export function SummaryCard({ totals, goal }: { totals: Nutrients; goal: Goal | null }) {
  const left = goal ? goal.kcal - totals.kcal : null;
  const over = left !== null && left < 0;
  const fiber = totals.fiber ?? 0;
  return (
    <Card className={styles.hero}>
      <div className={styles.summary}>
        <Ring eaten={totals.kcal} goal={goal?.kcal ?? null} />
        <p className={`${styles.leftLine} ${over ? styles.ringOver : ''}`}>
          {left === null
            ? t.noGoal
            : over
              ? t.overLine(formatKcal(-left))
              : t.leftLine(formatKcal(left))}
        </p>
        <div className={styles.macros}>
          <Macro
            label={ru.foods.protein}
            value={totals.protein}
            goal={goal?.protein}
            color="var(--macro-protein)"
          />
          <Macro
            label={ru.foods.fat}
            value={totals.fat}
            goal={goal?.fat}
            color="var(--macro-fat)"
          />
          <Macro
            label={ru.foods.carbs}
            value={totals.carbs}
            goal={goal?.carbs}
            color="var(--macro-carbs)"
          />
        </div>
        {(goal?.fiber || fiber > 0) && <Fiber value={fiber} goal={goal?.fiber} />}
      </div>
    </Card>
  );
}

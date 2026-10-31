import { formatGrams, formatKcal, formatSignedKcal } from '../../domain/format';
import type { DayMeta, Goal, Nutrients } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card, Switch } from '../../ui/kit';
import styles from './today.module.css';

const t = ru.today;
const R = 58;
const C = 2 * Math.PI * R;

function Ring({ eaten, goal }: { eaten: number; goal: number | null }) {
  const ratio = goal ? eaten / goal : 0;
  const over = goal !== null && eaten > goal;
  const left = goal !== null ? goal - eaten : null;
  return (
    <div className={styles.ring}>
      <svg width="136" height="136" viewBox="0 0 136 136" aria-hidden="true">
        <circle cx="68" cy="68" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          cx="68"
          cy="68"
          r={R}
          fill="none"
          stroke={over ? 'var(--over)' : 'var(--accent)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, ratio) * C} ${C}`}
          transform="rotate(-90 68 68)"
        />
      </svg>
      <div className={styles.ringCenter}>
        {left === null ? (
          <>
            <span className={styles.ringValue}>{formatKcal(eaten)}</span>
            <span className={styles.ringLabel}>{ru.units.kcal}</span>
          </>
        ) : over ? (
          <>
            <span className={`${styles.ringValue} ${styles.ringOver}`}>
              {formatSignedKcal(-left)}
            </span>
            <span className={styles.ringLabel}>{t.over('').trim()}</span>
          </>
        ) : (
          <>
            <span className={styles.ringValue}>{formatKcal(left)}</span>
            <span className={styles.ringLabel}>{t.left}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, goal }: { label: string; value: number; goal: number | undefined }) {
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
          style={{ width: `${Math.min(1, ratio) * 100}%` }}
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
    <Card>
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
          <Bar label={ru.foods.protein} value={totals.protein} goal={goal?.protein} />
          <Bar label={ru.foods.fat} value={totals.fat} goal={goal?.fat} />
          <Bar label={ru.foods.carbs} value={totals.carbs} goal={goal?.carbs} />
          <Bar label={ru.foods.fiber} value={totals.fiber ?? 0} goal={goal?.fiber} />
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

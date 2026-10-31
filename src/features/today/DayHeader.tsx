import { useRef } from 'react';
import { addDays, formatDateRu, parseLocalDate } from '../../domain/dates';
import { dayTitle } from './dayTitle';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { useWeek } from './useDay';
import styles from './today.module.css';

const t = ru.today;

/** Day switcher: arrows, horizontal swipe on the header/week strip, week circles. */
export function DayHeader() {
  const date = useUi((s) => s.date);
  const setDate = useUi((s) => s.setDate);
  const week = useWeek(date);
  const start = useRef<{ x: number; y: number } | null>(null);

  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(e.clientY - s.y)) {
        setDate(addDays(date, dx < 0 ? 1 : -1));
      }
    },
  };

  return (
    <div {...swipe}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t.prevDay}
          onClick={() => setDate(addDays(date, -1))}
        >
          ‹
        </button>
        <h1 className={styles.title}>{dayTitle(date)}</h1>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t.nextDay}
          onClick={() => setDate(addDays(date, 1))}
        >
          ›
        </button>
      </div>
      <div className={styles.week} role="group" aria-label={t.weekLabel}>
        {(week ?? []).map((d) => {
          const ratio = d.goal ? Math.min(1, d.kcal / d.goal) : d.kcal > 0 ? 1 : 0;
          const over = !!d.goal && d.kcal > d.goal * 1.1;
          const color = over ? 'var(--over)' : 'var(--accent)';
          const dateObj = parseLocalDate(d.date);
          return (
            <button
              key={d.date}
              type="button"
              className={`${styles.dayBtn} ${d.date === date ? styles.dayBtnActive : ''}`}
              aria-pressed={d.date === date}
              aria-label={formatDateRu(d.date, 'EEEE, d MMMM')}
              onClick={() => setDate(d.date)}
            >
              <span className={styles.dow}>{formatDateRu(d.date, 'EEEEEE')}</span>
              <span
                className={styles.dayCircle}
                style={{
                  background: `conic-gradient(${color} ${ratio * 360}deg, var(--surface-2) 0)`,
                }}
              >
                <span className={styles.dayNum}>{dateObj.getDate()}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

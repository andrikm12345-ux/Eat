import { useRef, useState } from 'react';
import { addDays, formatDateRu, parseLocalDate } from '../../domain/dates';
import { dayTitle } from './dayTitle';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { useWeek } from './useDay';
import styles from './today.module.css';

const t = ru.today;

type Start = { x: number; y: number };

/**
 * Horizontal swipe: follows the finger, then moves the date by `step` days.
 * A real swipe swallows the click that would otherwise select a day.
 */
function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<Start | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const reset = () => {
    start.current = null;
    setDx(0);
  };
  return {
    dx,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const mx = e.clientX - s.x;
        if (Math.abs(mx) > Math.abs(e.clientY - s.y)) setDx(mx);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = start.current;
        reset();
        if (!s) return;
        const mx = e.clientX - s.x;
        if (Math.abs(mx) > 50 && Math.abs(mx) > 1.5 * Math.abs(e.clientY - s.y)) {
          swiped.current = true;
          onSwipe(mx < 0 ? 1 : -1);
        }
      },
      onPointerCancel: reset,
      onClickCapture: (e: React.MouseEvent) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      },
    },
  };
}

/** Day switcher: arrows; swipe the title for the next/previous day, the week strip for weeks. */
export function DayHeader() {
  const date = useUi((s) => s.date);
  const setDate = useUi((s) => s.setDate);
  const week = useWeek(date);
  const [enter, setEnter] = useState<'fromRight' | 'fromLeft' | null>(null);
  const daySwipe = useSwipe((dir) => setDate(addDays(date, dir)));
  const weekSwipe = useSwipe((dir) => {
    setDate(addDays(date, 7 * dir));
    setEnter(dir === 1 ? 'fromRight' : 'fromLeft');
  });

  return (
    <div>
      <div className={styles.header} {...daySwipe.handlers}>
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
      <div
        key={week?.[0]?.date ?? 'week'}
        className={`${styles.week} ${enter ? styles[enter] : ''} ${weekSwipe.dx ? styles.dragging : ''}`}
        style={weekSwipe.dx ? { transform: `translateX(${weekSwipe.dx * 0.5}px)` } : undefined}
        role="group"
        aria-label={t.weekLabel}
        onAnimationEnd={() => setEnter(null)}
        {...weekSwipe.handlers}
      >
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

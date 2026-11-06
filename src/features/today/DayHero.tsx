import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { repos } from '../../db/repos';
import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { formatGrams, formatKcal } from '../../domain/format';
import type { Entry, Goal, Nutrients } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { loadStreaks } from '../../services/gamification';
import { toast, useUi } from '../../state/ui';
import { motionEnabled } from '../../ui/motion';
import { dayTitle } from './dayTitle';
import { useSwipe } from './useDaySwipe';
import { SkyHeader } from '../../ui/sky/SkyHeader';
import { useSky } from '../../ui/sky/useSky';
import { dayPins, greetingAt, linePos, slotNow, SLOTS, type Pin, type Slot } from './scene';
import styles from './dayHero.module.css';

const t = ru.today;
const h = t.hero;

const ICONS: Record<Slot, React.ReactNode> = {
  breakfast: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  lunch: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10" />
    </svg>
  ),
  snack: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" className={styles.dotFill} />
      <circle cx="14" cy="14.5" r="1" className={styles.dotFill} />
      <circle cx="15" cy="9" r="1" className={styles.dotFill} />
    </svg>
  ),
  dinner: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />
    </svg>
  ),
};

/** Brings the first entry of a meal into view in the day flow below. */
function scrollToEntry(id: string | null) {
  if (!id) return;
  document.querySelector(`[data-entry="${CSS.escape(id)}"]`)?.scrollIntoView({
    behavior: motionEnabled() ? 'smooth' : 'auto',
    block: 'center',
  });
}

async function shareDay(text: string) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    return; // closed by the person
  }
  try {
    await navigator.clipboard?.writeText(text);
    toast({ text: h.shared });
  } catch {
    /* nothing to do */
  }
}

/**
 * The top of "Сегодня": a sky that follows the time of day, the season, the date with the day's
 * status, protein / fat / carbs, a day line with the meals and one button for the next step.
 */
export function DayHero({
  date,
  entries,
  totals,
  goal,
}: {
  date: string;
  entries: Entry[];
  totals: Nutrients;
  goal: Goal | null;
}) {
  const setDate = useUi((s) => s.setDate);
  const openAdd = useUi((s) => s.openAdd);
  const { now, hours } = useSky();
  const today = toLocalDate(now);
  const login = useLiveQuery(() => repos.settings.get<string>(ACCOUNT.login, ''), []);
  const streaks = useLiveQuery(() => loadStreaks(repos, today), [today, entries.length]);
  const swipe = useSwipe((dir) => setDate(addDays(date, dir)));

  const pins = useMemo(() => dayPins(entries), [entries]);
  const nowPos =
    date === today ? linePos(now.getHours() * 60 + now.getMinutes()) : date < today ? 1 : 0;

  const left = goal ? goal.kcal - totals.kcal : null;
  const over = left !== null && left < 0;
  const status =
    entries.length === 0
      ? date >= today
        ? h.notStarted
        : h.noEntries
      : left === null
        ? t.noGoal
        : over
          ? h.over(formatKcal(-left))
          : h.left(formatKcal(left));

  const done =
    pins.every((p) => p.count > 0) ||
    (date === today ? hours >= 21 && entries.length > 0 : date < today && entries.length > 0);
  const next = SLOTS.find((s) => s === slotNow(hours) && !pins.find((p) => p.slot === s)?.count);
  const name = login ? login.charAt(0).toUpperCase() + login.slice(1) : '';

  const share = () =>
    void shareDay(
      h.shareText(
        formatDateRu(date, 'd MMMM'),
        formatKcal(totals.kcal),
        goal ? formatKcal(goal.kcal) : '—',
        formatGrams(totals.protein),
        formatGrams(totals.fat),
        formatGrams(totals.carbs),
      ),
    );

  const macro = (label: string, value: number, of: number | undefined, color: string) => {
    const isOver = !!of && value > of;
    return (
      <div className={styles.macro}>
        <b className={isOver ? styles.overText : ''}>{formatKcal(value)}</b>
        <span className={styles.muted}>{of ? t.macroFrom(formatGrams(of)) : ru.units.g}</span>
        <em style={{ color: isOver ? undefined : color }} className={isOver ? styles.overText : ''}>
          {label}
        </em>
      </div>
    );
  };

  return (
    <SkyHeader label={t.flowTitle}>
      <div className={styles.top}>
        <div className={styles.avatar} aria-hidden="true">
          {name ? name.charAt(0) : '🙂'}
        </div>
        <div className={styles.hello}>
          <span className={styles.muted}>{h.greet[greetingAt(hours)]}</span>
          <strong>{name}</strong>
        </div>
        {streaks && streaks.log.current > 0 && (
          <Link to="/more/achievements" className={styles.streak}>
            <span aria-hidden="true">🔥</span> {h.streak(streaks.log.current)}
          </Link>
        )}
      </div>

      <div className={styles.dateRow} {...swipe.handlers}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t.prevDay}
          onClick={() => setDate(addDays(date, -1))}
        >
          ‹
        </button>
        <div className={styles.dateText}>
          <h1 className={styles.srOnly}>{dayTitle(date)}</h1>
          {date === today ? (
            <span>{formatDateRu(date, 'd MMMM, EEEE')}</span>
          ) : (
            <button
              type="button"
              className={styles.linkish}
              aria-label={h.backToToday}
              onClick={() => setDate(today)}
            >
              {formatDateRu(date, 'd MMMM, EEEE')}
            </button>
          )}
          <b className={over ? styles.statusOver : styles.status}>{status}</b>
        </div>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t.nextDay}
          onClick={() => setDate(addDays(date, 1))}
        >
          ›
        </button>
      </div>

      <div className={styles.macros}>
        {macro(ru.foods.protein, totals.protein, goal?.protein, 'var(--hero-protein)')}
        {macro(ru.foods.fat, totals.fat, goal?.fat, 'var(--hero-fat)')}
        {macro(ru.foods.carbs, totals.carbs, goal?.carbs, 'var(--hero-carbs)')}
      </div>
      {(goal?.fiber || (totals.fiber ?? 0) > 0) && (
        <p className={styles.fiber}>
          {ru.foods.fiber}{' '}
          {goal?.fiber
            ? t.fiberOf(formatGrams(totals.fiber ?? 0), formatGrams(goal.fiber))
            : `${formatGrams(totals.fiber ?? 0)} ${ru.units.g}`}
        </p>
      )}

      <div className={styles.line} role="group" aria-label={t.flowTitle}>
        <div className={styles.track} />
        <div className={styles.fill} style={{ width: `${nowPos * 100}%` }} />
        {date === today && <div className={styles.nowMark} style={{ left: `${nowPos * 100}%` }} />}
        {pins.map((p: Pin) => (
          <button
            key={p.slot}
            type="button"
            className={styles.pin}
            style={{ left: `${p.pos * 100}%` }}
            aria-label={h.pin(h.slot[p.slot], p.time, p.count)}
            onClick={() => (p.count ? scrollToEntry(p.firstId) : openAdd())}
          >
            <span className={`${styles.dot} ${p.count ? styles.dotOn : ''}`}>
              {ICONS[p.slot]}
              {p.count > 1 && <span className={styles.count}>{p.count}</span>}
            </span>
            <small>{p.time ?? h.slot[p.slot]}</small>
          </button>
        ))}
      </div>

      <p className={styles.kcal}>
        <b>{formatKcal(totals.kcal)}</b> <span className={styles.muted}>{h.kcalOf}</span>{' '}
        <b>{goal ? formatKcal(goal.kcal) : '—'}</b>
        {left !== null && (
          <span className={over ? styles.overText : styles.muted}>
            {' · '}
            {over ? h.overShort(formatKcal(-left)) : h.leftShort(formatKcal(left))}
          </span>
        )}
      </p>

      {done ? (
        <button type="button" className={styles.cta} onClick={share}>
          {h.share}
          <small>{h.shareSub}</small>
        </button>
      ) : (
        <button type="button" className={styles.cta} onClick={() => openAdd()}>
          {date === today && next ? h.add[next] : h.addFood}
          <small>
            {entries.length === 0
              ? h.ctaStart
              : left !== null && !over
                ? h.ctaLeft(formatKcal(left))
                : h.shareSub}
          </small>
        </button>
      )}
    </SkyHeader>
  );
}

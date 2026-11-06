import type { CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ACHIEVEMENTS } from '../../domain/achievements';
import { formatDateRu, toLocalDate } from '../../domain/dates';
import { FREEZES_PER_MONTH } from '../../domain/streaks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { buildAchievementCtx, loadStreaks } from '../../services/gamification';
import { Card, Collapsible } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import s from './achievements.module.css';
import { Loading } from '../../ui/states';

const t = ru.achievements;

export default function AchievementsPage() {
  const today = toLocalDate(new Date());
  const data = useLiveQuery(async () => {
    const [rows, ctx, streaks] = await Promise.all([
      repos.db.achievements.toArray(),
      buildAchievementCtx(repos, today),
      loadStreaks(repos, today),
    ]);
    return { got: new Map(rows.map((r) => [r.id, r])), ctx, streaks };
  }, [today]);
  if (!data)
    return (
      <Page title={t.title}>
        <Loading />
      </Page>
    );
  const { streaks } = data;
  const unlocked = ACHIEVEMENTS.filter((a) => data.got.has(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !data.got.has(a.id));
  const medal = (a: (typeof ACHIEVEMENTS)[number]) => {
    const row = data.got.get(a.id);
    const res = a.check(data.ctx);
    const pct = Math.round(res.progress * 100);
    const title =
      a.id === 'path' && row
        ? ru.achievements.level(a.title, String((row.progress ?? 0) * 2.5).replace('.', ','))
        : a.title;
    return (
      <li key={a.id} className={`${s.medal} ${row ? s.got : ''}`}>
        <span
          className={s.coin}
          style={{ background: MEDAL[a.id] ?? MEDAL.default, '--p': `${pct}%` } as CSSProperties}
          aria-hidden="true"
        >
          {EMOJI[a.id] ?? '★'}
        </span>
        <span className={s.name}>{title}</span>
        <span className={s.sub}>
          {row ? t.unlockedAt(formatDateRu(row.unlockedAt.slice(0, 10))) : a.description}
        </span>
        {!row && (
          <span
            className={s.meter}
            role="meter"
            aria-label={a.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </li>
    );
  };
  return (
    <Page title={t.title}>
      <div className={s.streaks}>
        <Card tone="sun" className={s.streak}>
          <span className={s.big}>🔥 {t.days(streaks.log.current)}</span>
          <span className={s.label}>{t.streak}</span>
          <span className={s.best}>{t.best(streaks.log.best)}</span>
        </Card>
        <Card tone="weight" className={s.streak}>
          <span className={s.big}>⚖ {t.days(streaks.weigh.current)}</span>
          <span className={s.label}>{t.weighStreak}</span>
          <span className={s.best}>{t.best(streaks.weigh.best)}</span>
        </Card>
      </div>
      <Card tone="sky">
        <p className={styles.muted}>{t.freezes(FREEZES_PER_MONTH - streaks.log.freezesUsed)}</p>
        <p className={styles.muted}>{t.streakHint}</p>
      </Card>
      {unlocked.length > 0 && <ul className={s.grid}>{unlocked.map(medal)}</ul>}
      {locked.length > 0 && (
        <Collapsible title={t.upcoming(locked.length)}>
          <ul className={s.grid}>{locked.map(medal)}</ul>
        </Collapsible>
      )}
    </Page>
  );
}

/** A picture for each achievement on its medal. */
const EMOJI: Record<string, string> = {
  first_entry: '🍽',
  first_food: '🥕',
  first_barcode: '🏷',
  first_recipe: '📖',
  first_template: '📋',
  first_ai: '✨',
  first_weight: '⚖',
  first_measure: '📏',
  first_photo: '📷',
  days_7: '📅',
  days_30: '🗓',
  days_100: '💯',
  streak_7: '🔥',
  streak_30: '🔥',
  weigh_14: '⚖',
  measure_4w: '📐',
  protein_5: '🥚',
  fiber_week: '🥦',
  water_7: '💧',
  workouts_10: '🏃',
  path: '🧭',
  goal_reached: '🎯',
  tdee_explained: '⚡',
  checkins_4: '✅',
  first_backup: '💾',
};

const coin = (a: string, b: string) => `radial-gradient(circle at 35% 30%, ${a}, ${b} 75%)`;
const MEDAL: Record<string, string> = {
  default: coin('#ffe9a8', '#f2b33d'),
  streak_7: coin('#ffd9b0', '#ff8f4a'),
  streak_30: coin('#ffd0a8', '#f2703a'),
  first_weight: coin('#dcf6c6', '#7fcb55'),
  weigh_14: coin('#dcf6c6', '#6cbf45'),
  water_7: coin('#d8ecff', '#5aa9f0'),
  workouts_10: coin('#e7dcff', '#9a7cf0'),
  goal_reached: coin('#ffd6e0', '#f0789a'),
  protein_5: coin('#d6f3ec', '#4fbfa8'),
  fiber_week: coin('#e2f5cf', '#86c450'),
  first_ai: coin('#e2e6ff', '#8a9cf5'),
  first_photo: coin('#ffd9e2', '#f58aa6'),
  path: coin('#d8ecff', '#6c9cf0'),
};

import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import type { DayMeta } from '../../domain/types';
import { toLocalDate } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadStreaks } from '../../services/gamification';
import { Button } from '../../ui/kit';

const t = ru.achievements;

/** Logging streak chip and the "intentional skip" toggle for an empty day. */
export function StreakRow({ meta, empty }: { meta: DayMeta; empty: boolean }) {
  const today = toLocalDate(new Date());
  const streaks = useLiveQuery(() => loadStreaks(repos, today), [today]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sp-2)',
        marginBottom: 'var(--sp-2)',
        flexWrap: 'wrap',
      }}
    >
      {streaks && streaks.log.current > 0 ? (
        <Link
          to="/more/achievements"
          style={{
            color: 'var(--accent)',
            background: 'var(--accent-soft)',
            fontWeight: 'var(--fw-semibold)',
            textDecoration: 'none',
            fontSize: 'var(--fs-6)',
            padding: 'var(--sp-1) var(--sp-3)',
            borderRadius: 'var(--r-sheet)',
          }}
        >
          {t.chip(streaks.log.current)}
        </Link>
      ) : (
        <span />
      )}
      {empty && meta.date <= today && (
        <Button
          variant="text"
          aria-pressed={!!meta.intentionalSkip}
          onClick={() =>
            void repos.dayMeta.upsert(meta.date, { intentionalSkip: !meta.intentionalSkip })
          }
        >
          {meta.intentionalSkip ? t.skipDayOn : t.skipDay}
        </Button>
      )}
    </div>
  );
}

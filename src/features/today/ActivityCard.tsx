import { formatKcal } from '../../domain/format';
import { exerciseBonus } from '../../domain/met';
import type { DayMeta, ExerciseCaloriesMode, Workout } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card, LinkButton, NumberField } from '../../ui/kit';
import addStyles from '../add/add.module.css';
import styles from './today.module.css';

const t = ru.activityCard;

export function ActivityCard({
  meta,
  workouts,
  mode,
}: {
  meta: DayMeta;
  workouts: Workout[];
  mode: ExerciseCaloriesMode;
}) {
  const total = workouts.reduce((s, w) => s + (w.kcal ?? 0), 0);
  const bonus = exerciseBonus(mode, total);
  return (
    <Card title={t.title}>
      <div className={styles.activityRow}>
        <NumberField
          label={t.steps}
          value={meta.steps ?? null}
          onChange={(v) =>
            void repos.dayMeta.upsert(meta.date, {
              steps: v !== null && v >= 0 ? Math.round(v) : undefined,
            })
          }
        />
        <LinkButton to={`/workouts/new?date=${meta.date}`} variant="secondary">
          {t.addWorkout}
        </LinkButton>
      </div>
      {workouts.length > 0 && (
        <ul className={addStyles.list} style={{ marginBottom: 8 }}>
          {workouts.map((w) => (
            <li key={w.id} className={addStyles.row}>
              <div className={addStyles.rowLink}>
                <span className={addStyles.rowMain}>
                  <span className={addStyles.rowName}>{w.type}</span>
                  <span className={addStyles.rowSub}>
                    {w.time} · {w.durationMin} {ru.workouts.minutes}
                  </span>
                </span>
                {w.kcal ? (
                  <span className={addStyles.rowRight}>{formatKcal(w.kcal)} ккал</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={addStyles.muted} style={{ margin: 0, fontSize: 13 }}>
        {mode === 'none' || bonus === 0 ? t.noGoalChange : t.goalBonus(formatKcal(bonus))}
      </p>
    </Card>
  );
}

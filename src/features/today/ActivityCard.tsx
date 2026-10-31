import { formatKcal } from '../../domain/format';
import { exerciseBonus } from '../../domain/met';
import type { DayMeta, ExerciseCaloriesMode, Workout } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card, LinkButton, NumberField } from '../../ui/kit';
import styles from '../add/add.module.css';

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
      <NumberField
        label={t.steps}
        value={meta.steps ?? null}
        onChange={(v) =>
          void repos.dayMeta.upsert(meta.date, {
            steps: v !== null && v >= 0 ? Math.round(v) : undefined,
          })
        }
      />
      {workouts.length > 0 && (
        <ul className={styles.list} style={{ marginBottom: 8 }}>
          {workouts.map((w) => (
            <li key={w.id} className={styles.row}>
              <div className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{w.type}</span>
                  <span className={styles.rowSub}>
                    {w.time} · {w.durationMin} {ru.workouts.minutes}
                  </span>
                </span>
                {w.kcal ? <span className={styles.rowRight}>{formatKcal(w.kcal)} ккал</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.muted}>
        {mode === 'none' || bonus === 0 ? t.noGoalChange : t.goalBonus(formatKcal(bonus))}
      </p>
      <LinkButton to={`/workouts/new?date=${meta.date}`} variant="secondary" block>
        {t.addWorkout}
      </LinkButton>
    </Card>
  );
}

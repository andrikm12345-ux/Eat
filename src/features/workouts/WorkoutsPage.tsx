import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { formatExercises } from '../../domain/workout';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.workouts;

export default function WorkoutsPage() {
  const from = addDays(toLocalDate(new Date()), -60);
  const list = useLiveQuery(
    async () =>
      (await repos.workouts.list())
        .filter((w) => w.date >= from)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [from],
  );
  return (
    <Page title={t.title}>
      <div className={styles.actions}>
        <LinkButton to="/workouts/new">{t.new}</LinkButton>
      </div>
      {list?.length === 0 && <p className={styles.muted}>{t.empty}</p>}
      {list && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((w) => (
            <li key={w.id} className={styles.row}>
              <div className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{w.type}</span>
                  <span className={styles.rowSub}>
                    {formatDateRu(w.date, 'd MMMM')} · {w.time} · {w.durationMin} {t.minutes}
                    {w.kcal ? ` · ${formatKcal(w.kcal)} ккал` : ''}
                  </span>
                  {w.exercises?.length ? (
                    <span className={styles.rowSub}>{formatExercises(w.exercises)}</span>
                  ) : null}
                </span>
                <Button
                  variant="ghost"
                  aria-label={`${ru.common.delete}: ${w.type}`}
                  onClick={async () => {
                    await repos.workouts.softDelete(w.id);
                    toast({
                      text: t.deleted,
                      action: { label: ru.common.undo, run: () => repos.workouts.restore(w.id) },
                    });
                  }}
                >
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export { WorkoutNewPage } from './WorkoutNewPage';

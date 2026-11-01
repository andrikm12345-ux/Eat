import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { entryTitle } from '../../domain/day';
import { formatKcal } from '../../domain/format';
import type { Entry } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { copyDay, copyEntry } from '../../services/entries';
import { toast } from '../../state/ui';
import { Button } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { isToday, useAddTarget } from './addTarget';
import styles from './add.module.css';
import { Loading } from '../../ui/states';

const t = ru.repeat;

export default function RepeatPage() {
  const target = useAddTarget();
  const from = addDays(target.date, -7);
  const to = addDays(target.date, -1);
  const entries = useLiveQuery(() => repos.entries.inRange(from, to), [from, to]);
  if (!entries)
    return (
      <Page title={t.title}>
        <Loading />
      </Page>
    );

  const days = new Map<string, Entry[]>();
  for (const e of [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time),
  )) {
    days.set(e.date, [...(days.get(e.date) ?? []), e]);
  }

  async function repeat(e: Entry) {
    const time = isToday(target.date) ? target.time : e.time;
    const created = await copyEntry(repos, e, { date: target.date, time });
    toast({
      text: t.added,
      action: { label: ru.common.undo, run: () => repos.entries.softDelete(created.id) },
    });
  }

  async function copyAll(day: string) {
    const created = await copyDay(repos, day, target.date);
    toast({
      text: t.dayCopied(created.length),
      action: {
        label: ru.common.undo,
        run: async () => {
          for (const c of created) await repos.entries.softDelete(c.id);
        },
      },
    });
  }

  const yesterday = addDays(toLocalDate(new Date()), -1);
  return (
    <Page title={t.title}>
      <p className={styles.muted}>{t.hint}</p>
      {days.size === 0 && <p className={styles.muted}>{t.empty}</p>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className={styles.sectionTitle}>
            {day === yesterday ? ru.today.yesterday : formatDateRu(day, 'EEEE, d MMMM')}
          </h2>
          <ul className={styles.list}>
            {list.map((e) => (
              <li key={e.id} className={styles.row}>
                <button type="button" className={styles.rowLink} onClick={() => void repeat(e)}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{entryTitle(e)}</span>
                    <span className={styles.rowSub}>{e.time}</span>
                  </span>
                  <span className={styles.rowRight}>
                    {formatKcal(e.totals.kcal)} {ru.units.kcal}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => void copyAll(day)}>
              {t.copyDay}
            </Button>
          </div>
        </section>
      ))}
    </Page>
  );
}

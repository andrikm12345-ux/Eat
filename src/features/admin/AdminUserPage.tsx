import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { repos } from '../../db/repos';
import { addDays, formatDateRu, toLocalDate } from '../../domain/dates';
import { formatGrams, formatKcal, formatKg } from '../../domain/format';
import { goalFor } from '../../domain/goals';
import { sumNutrients } from '../../domain/nutrients';
import { ru } from '../../i18n/ru';
import { loadAdminDiary, type AdminDiary } from '../../services/adminView';
import { BackBar } from '../../ui/BackBar';
import { IconBack, IconChevron } from '../../ui/icons';
import { Card, Notice, Stat } from '../../ui/kit';
import { Loading } from '../../ui/states';
import styles from './admin.module.css';
import wizard from '../onboarding/Wizard.module.css';

const t = ru.admin;
const NB = ' ';
const unit = (value: string, u: string) => `${value}${NB}${u}`;

export default function AdminUserPage() {
  const { id = '' } = useParams();
  const [diary, setDiary] = useState<AdminDiary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = toLocalDate(new Date());
  const [date, setDate] = useState(today);

  useEffect(() => {
    let alive = true;
    void loadAdminDiary(repos, id).then((r) => {
      if (!alive) return;
      if (r.ok) setDiary(r.data);
      else setError(r.reason === 'forbidden' ? t.forbidden : t.loadError);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const view = useMemo(() => {
    if (!diary) return null;
    const dayEntries = diary.entries
      .filter((e) => e.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
    const totals = sumNutrients(dayEntries.map((e) => e.totals));
    const goal = goalFor(diary.goals, date);
    const weight = diary.weights
      .filter((w) => w.date <= date)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .at(-1);
    const water = diary.dayMeta.find((m) => m.date === date)?.waterMl ?? 0;
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      const kcal = sumNutrients(
        diary.entries.filter((e) => e.date === day).map((e) => e.totals),
      ).kcal;
      return { day, kcal };
    });
    return { dayEntries, totals, goal, weight, water, week };
  }, [diary, date, today]);

  return (
    <div className={wizard.wrap}>
      <BackBar title={diary?.login ?? t.unknownLogin} bleed />
      <h1 className={wizard.srTitle}>{diary?.login ?? t.unknownLogin}</h1>
      <div className={wizard.body}>
        {error && <Notice>{error}</Notice>}
        {!diary && !error && <Loading />}
        {diary && view && (
          <>
            <p className={styles.muted}>
              {diary.exportedAt
                ? t.syncedAt(new Date(diary.exportedAt).toLocaleString('ru-RU'))
                : t.noSync}
            </p>

            <div className={styles.dayNav}>
              <button
                type="button"
                className={styles.navBtn}
                aria-label={t.prevDay}
                onClick={() => setDate(addDays(date, -1))}
              >
                <IconBack />
              </button>
              <span className={styles.dayTitle}>{formatDateRu(date, 'd MMMM, EEEE')}</span>
              <button
                type="button"
                className={styles.navBtn}
                aria-label={t.nextDay}
                disabled={date >= today}
                onClick={() => setDate(addDays(date, 1))}
              >
                <IconChevron />
              </button>
            </div>

            <Card>
              <div className={styles.big}>
                {t.eaten}: {unit(formatKcal(view.totals.kcal), ru.units.kcal)}
              </div>
              {view.goal ? (
                <p>
                  {view.totals.kcal <= view.goal.kcal
                    ? `${t.left}: ${unit(formatKcal(view.goal.kcal - view.totals.kcal), ru.units.kcal)}`
                    : `${t.over}: ${unit(formatKcal(view.totals.kcal - view.goal.kcal), ru.units.kcal)}`}{' '}
                  <span className={styles.muted}>
                    {t.goalOf(unit(formatKcal(view.goal.kcal), ru.units.kcal))}
                  </span>
                </p>
              ) : (
                <p className={styles.muted}>{t.goalNone}</p>
              )}
              <div className={styles.stats}>
                <Stat
                  label="Б"
                  value={`${formatGrams(view.totals.protein)}${view.goal ? ` / ${formatGrams(view.goal.protein)}` : ''}`}
                />
                <Stat
                  label="Ж"
                  value={`${formatGrams(view.totals.fat)}${view.goal ? ` / ${formatGrams(view.goal.fat)}` : ''}`}
                />
                <Stat
                  label="У"
                  value={`${formatGrams(view.totals.carbs)}${view.goal ? ` / ${formatGrams(view.goal.carbs)}` : ''}`}
                />
              </div>
              {(view.weight || view.water > 0) && (
                <p className={styles.muted}>
                  {view.weight ? `${t.weight}: ${unit(formatKg(view.weight.kg), ru.units.kg)}` : ''}
                  {view.weight && view.water > 0 ? ' · ' : ''}
                  {view.water > 0 ? `${t.water}: ${unit(String(view.water), ru.units.ml)}` : ''}
                </p>
              )}
            </Card>

            <Card title={t.week}>
              <div className={styles.week}>
                {view.week.map((w) => (
                  <button
                    key={w.day}
                    type="button"
                    className={`${styles.weekDay} ${w.day === date ? styles.weekDayOn : ''}`}
                    onClick={() => setDate(w.day)}
                  >
                    <span>{formatDateRu(w.day, 'd')}</span>
                    <strong>{w.kcal ? formatKcal(w.kcal) : '–'}</strong>
                  </button>
                ))}
              </div>
            </Card>

            <Card title={t.meals}>
              {view.dayEntries.length === 0 && <p className={styles.muted}>{t.noMeals}</p>}
              {view.dayEntries.map((e) => (
                <div key={e.id} className={styles.meal}>
                  <div className={styles.mealHead}>
                    <span>
                      {e.time}
                      {e.mealLabel ? ` · ${e.mealLabel}` : ''}
                    </span>
                    <span>{unit(formatKcal(e.totals.kcal), ru.units.kcal)}</span>
                  </div>
                  {e.items.map((it, i) => (
                    <span key={i} className={styles.sub}>
                      {it.name} · {unit(formatGrams(it.grams), ru.units.g)} ·{' '}
                      {unit(formatKcal(it.nutrients.kcal), ru.units.kcal)}
                    </span>
                  ))}
                  {e.note && <span className={styles.sub}>{e.note}</span>}
                </div>
              ))}
            </Card>
            <p className={styles.muted}>{t.readOnly}</p>
          </>
        )}
      </div>
    </div>
  );
}

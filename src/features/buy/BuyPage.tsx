import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { dayTotals } from '../../domain/day';
import { toLocalTime } from '../../domain/dates';
import { formatGrams, formatKcal } from '../../domain/format';
import { exerciseBonus } from '../../domain/met';
import { isEvening, topUps, type TopUp } from '../../domain/topUp';
import { ru } from '../../i18n/ru';
import { reviewKey, useReview } from '../../state/review';
import { Button, Card, Notice, Segmented } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import { useDay } from '../today/useDay';
import styles from '../today/today.module.css';

const t = ru.buy;

type TimeKey = 'none' | 'quick' | 'any';
const MAX_MINUTES: Record<TimeKey, number | null> = { none: 5, quick: 15, any: null };
const TIME_OPTIONS = [
  { value: 'none', label: t.time.none },
  { value: 'quick', label: t.time.quick },
  { value: 'any', label: t.time.any },
] as const;

const line = (o: TopUp) => o.items.map((h) => `${h.name} ${formatGrams(h.grams)} г`).join(' + ');

/**
 * "Что докупить": what to buy in a shop for the rest of today. Simple ready foods that fit the
 * calories, protein and fat left, with the time of day (light food before sleep) and the time
 * the person is ready to spend cooking (after work: none). Computed on the device, no AI.
 */
export default function BuyPage() {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const day = useDay(target.date);
  const hour = new Date().getHours();
  const [time, setTime] = useState<TimeKey>(isEvening(hour) ? 'none' : 'quick');

  const left = useMemo(() => {
    if (!day?.goal) return null;
    const bonus = exerciseBonus(
      day.mode,
      day.workouts.reduce((s, w) => s + (w.kcal ?? 0), 0),
    );
    const eaten = dayTotals(day.entries);
    return {
      kcal: Math.round(day.goal.kcal + bonus - eaten.kcal),
      protein: Math.max(0, Math.round(day.goal.protein - eaten.protein)),
      fat: Math.round(day.goal.fat - eaten.fat),
      carbs: Math.round(day.goal.carbs - eaten.carbs),
      goalType: day.goal.type,
      eatenToday: day.entries.flatMap((e) => e.items.map((i) => i.name)),
    };
  }, [day]);

  const ideas = useMemo(
    () =>
      left
        ? topUps(
            [],
            { kcal: left.kcal, protein: left.protein, fat: left.fat, carbs: left.carbs },
            8,
            {
              hour,
              eatenToday: left.eatenToday,
              goalType: left.goalType,
              storeOnly: true,
              maxMinutes: MAX_MINUTES[time],
            },
          )
        : [],
    [left, hour, time],
  );

  const log = (o: TopUp) => {
    setDraft({
      items: o.items.map((h) => ({
        key: reviewKey(),
        name: h.name,
        grams: h.grams,
        per100g: h.per100g,
        source: 'memory',
        confidence: 'high',
      })),
      entrySource: 'repeat',
      analysis: 'local',
      date: target.date,
      time: toLocalTime(new Date()),
    });
    navigate('/review');
  };

  if (!day) return null;
  return (
    <Page title={t.title}>
      {!left ? (
        <Notice>{t.noGoal}</Notice>
      ) : left.kcal < 100 ? (
        <Notice>{t.full}</Notice>
      ) : (
        <Card title={t.title} tone="mint">
          <p className={styles.topUpLeft}>{t.left(formatKcal(left.kcal))}</p>
          <p className={styles.topUpLeftBju}>
            {t.bju(
              formatGrams(left.protein),
              formatGrams(Math.max(0, left.fat)),
              formatGrams(Math.max(0, left.carbs)),
            )}
          </p>
          <Segmented value={time} options={TIME_OPTIONS} onChange={setTime} label={t.timeLabel} />
          {ideas.length === 0 ? (
            <p className={styles.topUpHint}>{t.empty}</p>
          ) : (
            <ul className={styles.topUpList}>
              {ideas.map((o) => {
                const what = line(o);
                return (
                  <li key={what} className={styles.topUpRow}>
                    <span className={styles.topUpMain}>
                      <span className={styles.topUpName}>{what}</span>
                      <span className={styles.topUpBju}>
                        {t.kcalBju(
                          formatKcal(o.total.kcal),
                          t.bjuShort(
                            formatGrams(Math.round(o.total.protein)),
                            formatGrams(Math.round(o.total.fat)),
                            formatGrams(Math.round(o.total.carbs)),
                          ),
                        )}
                      </span>
                      <span className={styles.topUpPrep}>
                        {o.minutes <= 5 ? t.noCook : t.cook(o.minutes)}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      aria-label={t.addLabel(what)}
                      onClick={() => log(o)}
                    >
                      {t.add}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.topUpHint}>
            {t.hint[left?.goalType ?? 'maintain']}
            {isEvening(hour) ? ` ${t.hintEvening}` : ''}
          </p>
        </Card>
      )}
    </Page>
  );
}

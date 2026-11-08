import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { repos } from '../../db/repos';
import { addDays, toLocalTime } from '../../domain/dates';
import { formatGrams, formatKcal } from '../../domain/format';
import { habitsFrom, topUps, type TopUp } from '../../domain/topUp';
import type { Goal, Nutrients } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { reviewKey, useReview } from '../../state/review';
import { Button, Card } from '../../ui/kit';
import styles from './today.module.css';

const t = ru.today.topUp;

/** "Творог 5% 200 г + Банан 120 г". */
const describe = (o: TopUp) =>
  o.items.map((h) => `${h.name} ${formatGrams(h.grams)} г`).join(' + ');

/**
 * "Чем добрать норму": ideas for the rest of today from what the person usually eats, in their
 * usual portions, fitting the calories left and with as much of the protein left as possible.
 * Computed on the device from the diary, without the AI. A tap opens the usual check screen.
 */
export function TopUpCard({
  today,
  totals,
  goal,
}: {
  today: string;
  totals: Nutrients;
  goal: Goal;
}) {
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const history = useLiveQuery(() => repos.entries.inRange(addDays(today, -60), today), [today]);
  const leftKcal = Math.round(goal.kcal - totals.kcal);
  const leftProtein = Math.max(0, Math.round(goal.protein - totals.protein));
  const ideas = useMemo(
    () => (history ? topUps(habitsFrom(history), { kcal: leftKcal, protein: leftProtein }) : []),
    [history, leftKcal, leftProtein],
  );
  const left = { kcal: leftKcal, protein: leftProtein };
  if (!history || left.kcal < 150) return null;

  const log = (o: TopUp) => {
    setDraft({
      items: o.items.map((h) => ({
        key: reviewKey(),
        name: h.name,
        grams: h.grams,
        per100g: h.per100g,
        source: h.foodId ? 'catalog' : 'memory',
        confidence: 'high',
        ...(h.foodId ? { foodId: h.foodId } : {}),
      })),
      entrySource: 'repeat',
      analysis: 'local',
      date: today,
      time: toLocalTime(new Date()),
    });
    navigate('/review');
  };

  return (
    <Card title={t.title} tone="mint">
      <p className={styles.topUpLeft}>
        {t.left(formatKcal(left.kcal), left.protein > 5 ? formatGrams(left.protein) : null)}
      </p>
      {ideas.length === 0 ? (
        <p className={styles.topUpHint}>{t.empty}</p>
      ) : (
        <>
          <ul className={styles.topUpList}>
            {ideas.map((o) => {
              const what = describe(o);
              return (
                <li key={what} className={styles.topUpRow}>
                  <span className={styles.topUpMain}>
                    <span className={styles.topUpName}>{what}</span>
                    <span className={styles.topUpMacros}>
                      {t.macros(formatKcal(o.total.kcal), formatGrams(o.total.protein))}
                    </span>
                  </span>
                  <Button variant="secondary" aria-label={t.addLabel(what)} onClick={() => log(o)}>
                    {t.add}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className={styles.topUpHint}>{t.hint}</p>
        </>
      )}
    </Card>
  );
}

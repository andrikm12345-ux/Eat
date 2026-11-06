import { dayTotals } from '../../domain/day';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { Card } from '../../ui/kit';
import pageStyles from '../../ui/Page.module.css';
import { TrendCard } from '../weight/TrendCard';
import { Banners } from './Banners';
import { StreakRow } from './StreakRow';
import { exerciseBonus } from '../../domain/met';
import { ActivityCard } from './ActivityCard';
import { DayFlow } from './DayFlow';
import { DayHero } from './DayHero';
import { useDay } from './useDay';
import { WaterCard } from './WaterCard';
import styles from './today.module.css';

export default function TodayPage() {
  const date = useUi((s) => s.date);
  const day = useDay(date);
  const bonus = day
    ? exerciseBonus(
        day.mode,
        day.workouts.reduce((s, w) => s + (w.kcal ?? 0), 0),
      )
    : 0;
  // In 'half'/'full' modes workout calories are added to that day's goal.
  const goal = day?.goal ? { ...day.goal, kcal: day.goal.kcal + bonus } : null;
  return (
    <section
      className={`${pageStyles.page} stagger`}
      style={{ paddingTop: '0' }}
      aria-label={ru.pages.today.title}
    >
      {day && (
        <>
          <DayHero date={date} entries={day.entries} totals={dayTotals(day.entries)} goal={goal} />
          <Banners />
          {day.entries.length === 0 && <StreakRow meta={day.meta} empty showStreak={false} />}
          <Card title={ru.today.flowTitle}>
            <DayFlow entries={day.entries} />
          </Card>
          <div className={styles.pair}>
            <TrendCard />
            <WaterCard meta={day.meta} goalMl={day.goal?.waterMl} />
          </div>
          <ActivityCard meta={day.meta} workouts={day.workouts} mode={day.mode} />
        </>
      )}
    </section>
  );
}

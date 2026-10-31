import { dayTotals } from '../../domain/day';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { Card } from '../../ui/kit';
import pageStyles from '../../ui/Page.module.css';
import { DayFlow } from './DayFlow';
import { DayHeader } from './DayHeader';
import { SummaryCard } from './SummaryCard';
import { useDay } from './useDay';
import { WaterCard } from './WaterCard';

export default function TodayPage() {
  const date = useUi((s) => s.date);
  const day = useDay(date);
  return (
    <section
      className={pageStyles.page}
      style={{ paddingTop: 0 }}
      aria-label={ru.pages.today.title}
    >
      <DayHeader />
      {day && (
        <>
          <SummaryCard totals={dayTotals(day.entries)} goal={day.goal} meta={day.meta} />
          <Card title={ru.today.flowTitle}>
            <DayFlow entries={day.entries} />
          </Card>
          <WaterCard meta={day.meta} goalMl={day.goal?.waterMl} />
        </>
      )}
    </section>
  );
}

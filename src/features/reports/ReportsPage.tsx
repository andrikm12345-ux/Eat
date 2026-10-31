import { useState } from 'react';
import { ru } from '../../i18n/ru';
import { Segmented } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { EnergyCard } from '../progress/EnergyCard';
import { MicroView } from './MicroView';
import { TdeeChart } from './TdeeChart';
import { WeekReportView } from './WeekReportView';

const t = ru.reports;
type Tab = 'week' | 'energy' | 'micro';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('week');
  return (
    <Page title={t.title}>
      <Segmented
        label={t.tab}
        value={tab}
        onChange={setTab}
        options={(['week', 'energy', 'micro'] as const).map((v) => ({
          value: v,
          label: t.tabs[v],
        }))}
      />
      {tab === 'week' && <WeekReportView />}
      {tab === 'energy' && (
        <>
          <TdeeChart />
          <EnergyCard />
        </>
      )}
      {tab === 'micro' && <MicroView />}
    </Page>
  );
}

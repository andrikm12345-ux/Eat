import { ru } from '../../i18n/ru';
import { EmptyState, Page } from '../../ui/Page';

export default function ReportsPage() {
  return (
    <Page title={ru.pages.reports.title}>
      <EmptyState text={ru.pages.reports.empty} />
    </Page>
  );
}

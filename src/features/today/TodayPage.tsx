import { ru } from '../../i18n/ru';
import { EmptyState, Page } from '../../ui/Page';

export default function TodayPage() {
  return (
    <Page title={ru.pages.today.title}>
      <EmptyState text={ru.pages.today.empty} />
    </Page>
  );
}

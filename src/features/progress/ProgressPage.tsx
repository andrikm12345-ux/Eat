import { ru } from '../../i18n/ru';
import { EmptyState, Page } from '../../ui/Page';

export default function ProgressPage() {
  return (
    <Page title={ru.pages.progress.title}>
      <EmptyState text={ru.pages.progress.empty} />
    </Page>
  );
}

import { ru } from '../../i18n/ru';
import { EmptyState, Page } from '../../ui/Page';

export default function MorePage() {
  return (
    <Page title={ru.pages.more.title}>
      <EmptyState text={ru.pages.more.empty} />
    </Page>
  );
}

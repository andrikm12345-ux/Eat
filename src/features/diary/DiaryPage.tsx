import { ru } from '../../i18n/ru';
import { EmptyState, Page } from '../../ui/Page';

export default function DiaryPage() {
  return (
    <Page title={ru.pages.diary.title}>
      <EmptyState text={ru.pages.diary.empty} />
    </Page>
  );
}

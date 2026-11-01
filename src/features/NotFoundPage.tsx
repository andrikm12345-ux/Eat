import { ru } from '../i18n/ru';
import { LinkButton } from '../ui/kit';
import { Page } from '../ui/Page';

export default function NotFoundPage() {
  return (
    <Page title={ru.pages.notFound.title}>
      <LinkButton to="/">{ru.pages.notFound.back}</LinkButton>
    </Page>
  );
}

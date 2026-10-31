import { Link } from 'react-router';
import { ru } from '../i18n/ru';
import { Page } from '../ui/Page';

export default function NotFoundPage() {
  return (
    <Page title={ru.pages.notFound.title}>
      <Link to="/">{ru.pages.notFound.back}</Link>
    </Page>
  );
}

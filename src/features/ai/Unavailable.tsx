import { ru } from '../../i18n/ru';
import { LinkButton, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';

/** Placeholder for a temporarily switched-off feature. */
export function Unavailable({ title }: { title: string }) {
  return (
    <Page title={title}>
      <Notice>{ru.add.unavailablePage}</Notice>
      <LinkButton to="/add/search">{ru.search.title}</LinkButton>
    </Page>
  );
}

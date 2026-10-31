import { ru } from '../../i18n/ru';
import { Card } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.about;

export default function AboutPage() {
  return (
    <Page title={t.title}>
      <Card>
        <p>{t.text}</p>
        <p className={styles.muted}>{t.version(__APP_VERSION__)}</p>
        <p className={styles.muted}>{t.data}</p>
      </Card>
      <Card title={t.install}>
        <p>{t.iphone}</p>
        <p>{t.android}</p>
      </Card>
    </Page>
  );
}

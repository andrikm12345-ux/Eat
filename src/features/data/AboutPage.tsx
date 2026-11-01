import { useState } from 'react';
import { ru } from '../../i18n/ru';
import { forceUpdate } from '../../pwa/forceUpdate';
import { Button, Card, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.about;

export default function AboutPage() {
  const [offline, setOffline] = useState(false);
  return (
    <Page title={t.title}>
      <Card>
        <p>{t.text}</p>
        <p className={styles.muted}>{t.version(__APP_VERSION__)}</p>
        <p className={styles.muted}>{t.data}</p>
      </Card>
      <Card title={t.updateTitle}>
        <p className={styles.muted}>{t.updateText}</p>
        {offline && <Notice>{t.updateOffline}</Notice>}
        <Button
          block
          variant="secondary"
          onClick={() => {
            if (!navigator.onLine) return setOffline(true);
            void forceUpdate();
          }}
        >
          {t.updateGo}
        </Button>
      </Card>
      <Card title={t.install}>
        <p>{t.iphone}</p>
        <p>{t.android}</p>
      </Card>
    </Page>
  );
}

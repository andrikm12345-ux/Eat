import { useLiveQuery } from 'dexie-react-hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { Card, LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.storage;

export default function StoragePage() {
  const cloud = useLiveQuery(async () => {
    const [login, token, last, admin] = await Promise.all([
      repos.settings.get<string>(ACCOUNT.login, ''),
      repos.settings.get<string>(ACCOUNT.token, ''),
      repos.settings.get<string>(ACCOUNT.lastSync, ''),
      repos.settings.get<boolean>(ACCOUNT.aiAdmin, false),
    ]);
    return { login, signedIn: !!token, last, admin };
  }, []);
  return (
    <Page title={t.title}>
      {cloud && (
        <Card>
          <p>{cloud.signedIn ? t.cloudOn(cloud.login, cloud.admin) : t.cloudOff}</p>
          {cloud.signedIn && cloud.last && (
            <p className={styles.muted}>
              {t.cloudLast(new Date(cloud.last).toLocaleString('ru-RU'))}
            </p>
          )}
          <LinkButton to="/account" variant="secondary" block>
            {t.cloudLink}
          </LinkButton>
        </Card>
      )}
      <p className={styles.muted}>{t.hint}</p>
    </Page>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from '../../pwa/storage';
import { Button, Card, LinkButton, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.storage;
const mb = (b: number) => t.mb(b / 1024 / 1024);

export default function StoragePage() {
  const [s, setS] = useState<StorageStatus | null>(null);
  const refresh = () => void getStorageStatus().then(setS);
  useEffect(refresh, []);
  const cloud = useLiveQuery(async () => {
    const [login, token, last] = await Promise.all([
      repos.settings.get<string>(ACCOUNT.login, ''),
      repos.settings.get<string>(ACCOUNT.token, ''),
      repos.settings.get<string>(ACCOUNT.lastSync, ''),
    ]);
    return { login, signedIn: !!token, last };
  }, []);
  return (
    <Page title={t.title}>
      <Card>
        <Stat label={t.persisted} value="" />
        <p className={styles.muted}>
          {s?.persisted === true
            ? t.persistedYes
            : s?.persisted === false
              ? t.persistedNo
              : t.persistedUnknown}
        </p>
        {s?.persisted !== true && (
          <Button
            block
            variant="secondary"
            onClick={async () => {
              await requestPersistentStorage();
              refresh();
            }}
          >
            {t.request}
          </Button>
        )}
        {s?.usage !== null && s?.quota !== null && s && (
          <p>{t.usage(mb(s.usage as number), mb(s.quota as number))}</p>
        )}
      </Card>
      {cloud && (
        <Card>
          <p>{cloud.signedIn ? t.cloudOn(cloud.login) : t.cloudOff}</p>
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

import { useEffect, useState } from 'react';
import { ru } from '../../i18n/ru';
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from '../../pwa/storage';
import { Button, Card, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.storage;
const mb = (b: number) => t.mb(b / 1024 / 1024);

export default function StoragePage() {
  const [s, setS] = useState<StorageStatus | null>(null);
  const refresh = () => void getStorageStatus().then(setS);
  useEffect(refresh, []);
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
      <p className={styles.muted}>{t.hint}</p>
    </Page>
  );
}

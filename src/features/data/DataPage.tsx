import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { formatDateRu } from '../../domain/dates';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { exportCsv, importJson, parseBackup, saveBackup, type Backup } from '../../services/backup';
import { shareOrDownload } from '../../services/ics';
import { toast } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Card, LinkButton, Notice, Switch } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.data;

export default function DataPage() {
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const last = useLiveQuery(
    () => repos.settings.get(SETTINGS.lastBackupAt.key, SETTINGS.lastBackupAt.def),
    [],
  );

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending) return;
    setBusy(true);
    try {
      if (mode === 'replace') await saveBackup(repos, true);
      const { written } = await importJson(repos, pending, mode);
      toast({ text: t.imported(written) });
      setPending(null);
      setConfirmReplace(false);
    } finally {
      setBusy(false);
    }
  }

  const count = pending
    ? Object.values(pending.tables).reduce((s, rows) => s + (rows?.length ?? 0), 0)
    : 0;

  return (
    <Page title={t.title}>
      <Card title={t.exportTitle}>
        <p className={styles.muted}>{t.exportHint}</p>
        <p className={styles.muted}>
          {last ? t.lastBackup(formatDateRu(last.slice(0, 10))) : t.noBackup}
        </p>
        <Switch label={t.includePhotos} checked={photos} onChange={setPhotos} />
        <Button
          block
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saveBackup(repos, photos);
              toast({ text: t.exported });
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.exportJson}
        </Button>
      </Card>
      <Card title={t.csvTitle}>
        <p className={styles.muted}>{t.csvHint}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(t.csvFiles).map(([file, label]) => (
            <Button
              key={file}
              variant="secondary"
              onClick={async () => {
                const all = await exportCsv(repos);
                await shareOrDownload(file, 'text/csv', '﻿' + (all[file] ?? ''));
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>
      <Card title={t.importTitle}>
        <label
          className={styles.input}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          {t.importFile}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="backup-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError(null);
              try {
                setPending(parseBackup(await f.text()));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {error && <Notice>{error}</Notice>}
        {pending && (
          <>
            <p>{t.importInfo(formatDateRu(pending.exportedAt.slice(0, 10)), count)}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button disabled={busy} onClick={() => void doImport('merge')}>
                {t.merge}
              </Button>
              <p className={styles.muted}>{t.mergeHint}</p>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmReplace(true)}>
                {t.replace}
              </Button>
            </div>
          </>
        )}
      </Card>
      <LinkButton to="/data/csv" variant="secondary" block>
        {t.csvImport}
      </LinkButton>
      <BottomSheet open={confirmReplace} title={t.replace} onClose={() => setConfirmReplace(false)}>
        <p>{t.replaceConfirm}</p>
        <Button block disabled={busy} onClick={() => void doImport('replace')}>
          {t.replaceGo}
        </Button>
      </BottomSheet>
    </Page>
  );
}

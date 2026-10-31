import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { checkKey } from '../../ai/client';
import { AI_DEFAULTS, AI_KEYS, maskKey } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, Card, Notice, Row, Switch, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import { useAiConfig } from './useAi';

const t = ru.ai;

export default function AiSettingsPage() {
  const cfg = useAiConfig();
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const logs = useLiveQuery(
    async () =>
      (await repos.aiRuns.list())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
    [],
  );
  if (!cfg) return <Page title={t.settingsTitle}>{ru.common.loading}</Page>;

  return (
    <Page title={t.settingsTitle}>
      <Card>
        <Switch
          label={t.enabled}
          checked={cfg.enabled}
          onChange={(v) => void repos.settings.set(AI_KEYS.enabled, v)}
          hint={t.enabledHint}
        />
      </Card>
      <Card title={t.key}>
        {cfg.apiKey && <p className={styles.muted}>{t.keySaved(maskKey(cfg.apiKey))}</p>}
        <TextField
          label={t.key}
          type="password"
          autoComplete="off"
          value={key}
          onChange={setKey}
          hint={t.keyHint}
        />
        <Row>
          <Button
            disabled={key.trim().length < 10}
            onClick={async () => {
              await repos.settings.set(AI_KEYS.apiKey, key.trim());
              setKey('');
              toast({ text: ru.goals.saved });
            }}
          >
            {t.saveKey}
          </Button>
          <Button
            variant="secondary"
            disabled={!cfg.apiKey || checking}
            onClick={async () => {
              setChecking(true);
              const ok = await checkKey(cfg.apiKey);
              setChecking(false);
              toast({ text: ok ? t.keyOk : t.keyBad });
            }}
          >
            {t.checkKey}
          </Button>
        </Row>
        {cfg.apiKey && (
          <Button variant="ghost" onClick={() => void repos.settings.remove(AI_KEYS.apiKey)}>
            {t.removeKey}
          </Button>
        )}
      </Card>
      <Card>
        <TextField
          label={t.modelText}
          value={cfg.modelText}
          onChange={(v) =>
            void repos.settings.set(AI_KEYS.modelText, v.trim() || AI_DEFAULTS.modelText)
          }
        />
        <TextField
          label={t.modelVision}
          value={cfg.modelVision}
          onChange={(v) =>
            void repos.settings.set(AI_KEYS.modelVision, v.trim() || AI_DEFAULTS.modelVision)
          }
        />
      </Card>
      <Card title={t.consentTitle}>
        <p className={styles.muted}>{t.consentText}</p>
        {cfg.consent ? (
          <>
            <Notice tone="info">{t.consentGiven}</Notice>
            <Button variant="ghost" onClick={() => void repos.settings.set(AI_KEYS.consent, false)}>
              {t.consentRevoke}
            </Button>
          </>
        ) : (
          <Button onClick={() => void repos.settings.set(AI_KEYS.consent, true)}>
            {t.consentAccept}
          </Button>
        )}
      </Card>
      <h2 className={styles.sectionTitle}>{t.logs}</h2>
      {logs?.length === 0 && <p className={styles.muted}>{t.logsEmpty}</p>}
      {logs && logs.length > 0 && (
        <ul className={styles.list}>
          {logs.map((l) => (
            <li key={l.id} className={styles.row}>
              <details style={{ padding: '10px 14px', width: '100%' }}>
                <summary>
                  {t.logItem(t.kinds[l.kind], l.model, l.latencyMs)}
                  {l.error ? ` · ${l.error}` : ''}
                </summary>
                <pre
                  style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 240, overflow: 'auto' }}
                >
                  {JSON.stringify({ request: l.request, response: l.response }, null, 1).slice(
                    0,
                    6000,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

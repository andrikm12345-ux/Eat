import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { checkKey, listModels, type ModelInfo } from '../../ai/client';
import { AI_DEFAULTS, AI_KEYS, maskKey } from '../../ai/settings';
import type { ApiFormat } from '../../ai/client';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, Card, Notice, Row, Segmented, Switch, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import { useAiConfig } from './useAi';

const t = ru.ai;

const PRESETS = [
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { name: 'TeamoRouter', url: 'https://api.teamorouter.com/v1' },
  { name: 'TokenHarbor', url: 'https://tokenharbor.ai/v1' },
  { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
];

export default function AiSettingsPage() {
  const cfg = useAiConfig();
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [base, setBase] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[] | 'loading' | 'fail' | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyVision, setOnlyVision] = useState(false);
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
              const ok = await checkKey(cfg.apiKey, fetch, cfg.baseUrl, cfg.format);
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
        <Segmented
          label={t.format}
          value={cfg.format}
          onChange={(v: ApiFormat) => void repos.settings.set(AI_KEYS.format, v)}
          options={[
            { value: 'anthropic', label: t.formatAnthropic },
            { value: 'openai', label: t.formatOpenai },
          ]}
        />
        <p className={styles.muted}>{t.formatHint}</p>
        {cfg.format === 'openai' && (
          <>
            <p className={styles.muted}>{t.presets}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {PRESETS.map((p) => (
                <Button
                  key={p.url}
                  variant="secondary"
                  onClick={() => {
                    setBase(p.url);
                    void repos.settings.set(AI_KEYS.baseUrl, p.url);
                  }}
                >
                  {p.name}
                </Button>
              ))}
            </div>
            {!cfg.baseUrl && <Notice>{t.needAddress}</Notice>}
          </>
        )}
        <TextField
          label={t.baseUrl}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://"
          value={base ?? cfg.baseUrl}
          error={
            base !== null && base.trim() !== '' && !/^https:\/\//i.test(base.trim())
              ? t.baseUrlBad
              : null
          }
          hint={t.baseUrlHint}
          onChange={(v) => {
            setBase(v);
            const x = v.trim();
            if (x === '' || /^https:\/\//i.test(x)) void repos.settings.set(AI_KEYS.baseUrl, x);
          }}
        />
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
      <Card>
        <Button
          variant="secondary"
          disabled={!cfg.apiKey || models === 'loading'}
          onClick={async () => {
            setModels('loading');
            setModels((await listModels(cfg.apiKey, fetch, cfg.baseUrl, cfg.format)) ?? 'fail');
          }}
        >
          {models === 'loading' ? t.modelsLoading : t.modelsShow}
        </Button>
        {models === 'fail' && <Notice>{t.modelsFail}</Notice>}
        {Array.isArray(models) && (
          <>
            <p className={styles.muted}>{t.modelsHint}</p>
            {models.some((m) => m.free) && (
              <Switch label={t.onlyFree} checked={onlyFree} onChange={setOnlyFree} />
            )}
            {models.some((m) => m.vision) && (
              <Switch label={t.onlyVision} checked={onlyVision} onChange={setOnlyVision} />
            )}
            <ul
              style={{ maxHeight: 320, overflow: 'auto', padding: 0, margin: 0, listStyle: 'none' }}
            >
              {models
                .filter((m) => (!onlyFree || m.free) && (!onlyVision || m.vision))
                .sort(
                  (a, b) =>
                    Number(b.free) - Number(a.free) || Number(!!b.vision) - Number(!!a.vision),
                )
                .map((m) => (
                  <li
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '6px 0',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {m.id}
                      {m.free && <small className={styles.muted}> · {t.freeBadge}</small>}
                      {m.vision && <small className={styles.muted}> · {t.visionBadge}</small>}
                    </span>
                    <Button
                      variant={cfg.modelText === m.id ? 'primary' : 'secondary'}
                      aria-label={`${t.forText}: ${m.id}`}
                      onClick={() => void repos.settings.set(AI_KEYS.modelText, m.id)}
                    >
                      {t.forText}
                    </Button>
                    <Button
                      variant={cfg.modelVision === m.id ? 'primary' : 'secondary'}
                      aria-label={`${t.forPhoto}: ${m.id}`}
                      onClick={() => void repos.settings.set(AI_KEYS.modelVision, m.id)}
                    >
                      {t.forPhoto}
                    </Button>
                  </li>
                ))}
            </ul>
          </>
        )}
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

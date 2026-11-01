import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { refreshSharedAi } from '../../services/sharedAi';
import { Card, Collapsible, Switch } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import { OwnConnection } from './OwnConnection';
import { SharedAdminCard } from './SharedAdminCard';
import { useAiConfig } from './useAi';
import { Loading } from '../../ui/states';

const t = ru.ai;

export default function AiSettingsPage() {
  const cfg = useAiConfig();
  const logs = useLiveQuery(
    async () =>
      (await repos.aiRuns.list())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
    [],
  );
  const isAdmin = useLiveQuery(() => repos.settings.get<boolean>(ACCOUNT.aiAdmin, false), []);
  useEffect(() => {
    void refreshSharedAi(repos);
  }, []);
  if (!cfg)
    return (
      <Page title={t.settingsTitle}>
        <Loading />
      </Page>
    );

  // Users of the shared AI see only the two switches; the connection settings are for
  // those without the shared AI and for the administrator.
  const showConnection = !cfg.shared || !!isAdmin;
  const minimal = cfg.shared && !isAdmin;

  return (
    <Page title={t.settingsTitle}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <Switch
            label={t.enabled}
            checked={cfg.enabled}
            onChange={(v) => void repos.settings.set(AI_KEYS.enabled, v)}
            {...(minimal ? {} : { hint: t.enabledHint })}
          />
          <Switch
            label={t.consentSwitch}
            checked={cfg.consent}
            onChange={(v) => void repos.settings.set(AI_KEYS.consent, v)}
            {...(minimal ? {} : { hint: t.consentText })}
          />
        </div>
      </Card>
      {isAdmin && <SharedAdminCard />}
      {showConnection &&
        (cfg.shared ? (
          <Collapsible title={t.shared.own}>
            <p className={styles.muted}>{t.shared.ownHint}</p>
            <OwnConnection cfg={cfg} />
          </Collapsible>
        ) : (
          <OwnConnection cfg={cfg} />
        ))}
      {/* The request log (prompts and raw replies) is for the administrator only. */}
      {isAdmin && (
        <>
          <h2 className={styles.sectionTitle}>{t.logs}</h2>
          {logs?.length === 0 && <p className={styles.muted}>{t.logsEmpty}</p>}
          {logs && logs.length > 0 && (
            <ul className={styles.list}>
              {logs.map((l) => (
                <li key={l.id} className={styles.row}>
                  <details style={{ padding: 'var(--sp-2) var(--sp-3)', width: '100%' }}>
                    <summary>
                      {t.logItem(t.kinds[l.kind], l.model, l.latencyMs)}
                      {l.error ? ` · ${l.error}` : ''}
                    </summary>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 'var(--fs-6)',
                        maxHeight: 240,
                        overflow: 'auto',
                      }}
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
        </>
      )}
    </Page>
  );
}

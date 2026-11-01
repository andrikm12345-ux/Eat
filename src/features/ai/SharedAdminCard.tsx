import { useEffect, useState } from 'react';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadSharedConfig, saveSharedConfig, type SharedAiConfig } from '../../services/sharedAi';
import { Button, Card, Notice, Switch, TextField } from '../../ui/kit';
import styles from '../add/add.module.css';

const t = ru.ai.admin;

/** Administrator only: the AI settings every user gets (the key itself stays on the server). */
export function SharedAdminCard() {
  const [cfg, setCfg] = useState<SharedAiConfig | null | 'loading'>('loading');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadSharedConfig(repos).then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);

  if (cfg === 'loading') return null;
  if (!cfg) return <Notice>{t.loadFail}</Notice>;
  const set = (patch: Partial<SharedAiConfig>) => setCfg({ ...cfg, ...patch });

  return (
    <Card title={t.title}>
      <p className={styles.muted}>{t.hint}</p>
      <p className={styles.muted}>{cfg.keySet ? t.keySet : t.keyMissing}</p>
      <Switch label={t.enabled} checked={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      <TextField
        label={ru.ai.baseUrl}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        value={cfg.baseUrl}
        onChange={(v) => set({ baseUrl: v })}
      />
      <TextField
        label={ru.ai.modelText}
        autoCapitalize="none"
        spellCheck={false}
        value={cfg.modelText}
        onChange={(v) => set({ modelText: v })}
      />
      <TextField
        label={ru.ai.modelVision}
        autoCapitalize="none"
        spellCheck={false}
        value={cfg.modelVision}
        onChange={(v) => set({ modelVision: v })}
      />
      <p className={styles.muted}>{t.limit(cfg.dailyLimit)}</p>
      {message && <Notice tone="info">{message}</Notice>}
      <Button
        block
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setMessage(null);
          const saved = await saveSharedConfig(repos, {
            enabled: cfg.enabled,
            baseUrl: cfg.baseUrl,
            modelText: cfg.modelText,
            modelVision: cfg.modelVision,
          });
          setSaving(false);
          if (saved) {
            setCfg(saved);
            setMessage(t.saved);
          } else setMessage(t.saveFail);
        }}
      >
        {t.save}
      </Button>
    </Card>
  );
}

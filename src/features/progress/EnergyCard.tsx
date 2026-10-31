import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { toLocalDate, weekDays } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { Button, Card, NumberField, Notice } from '../../ui/kit';
import listStyles from '../add/add.module.css';

const t = ru.energy;

/** Current adaptive TDEE with confidence, week pause and parameters. */
export function EnergyCard() {
  const today = toLocalDate(new Date());
  const days = weekDays(today);
  const [showSettings, setShowSettings] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const data = useLiveQuery(async () => {
    const last = (await repos.db.tdeeHistory.orderBy('date').last()) ?? null;
    const metas = await repos.db.dayMeta.bulkGet(days);
    const paused = days.every((_, i) => metas[i]?.excludeFromTdee);
    const N = await repos.settings.get(SETTINGS.tdeeWindowDays.key, SETTINGS.tdeeWindowDays.def);
    const rho = await repos.settings.get(SETTINGS.tdeeRho.key, SETTINGS.tdeeRho.def);
    return { last, paused, N, rho };
  }, [days[0]]);
  if (!data) return null;
  const { last } = data;
  const low = !last || last.confidence < 0.05;

  async function togglePause() {
    for (const d of days) await repos.dayMeta.upsert(d, { excludeFromTdee: !data?.paused });
  }

  return (
    <Card title={t.title}>
      {last ? (
        <>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{formatKcal(last.tdee)} ккал</p>
          <p className={listStyles.muted}>
            {t.tdee} · {t.confidence(Math.round(last.confidence * 100))}
          </p>
          <div
            aria-hidden="true"
            style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', marginBottom: 8 }}
          >
            <div
              style={{
                width: `${Math.round(last.confidence * 100)}%`,
                height: '100%',
                borderRadius: 3,
                background: 'var(--accent)',
              }}
            />
          </div>
        </>
      ) : null}
      {low && <Notice>{t.lowData}</Notice>}
      {data.paused && <Notice tone="info">{t.paused}</Notice>}
      <Button block variant="secondary" onClick={() => void togglePause()}>
        {data.paused ? t.unpause : t.pause}
      </Button>
      <p className={listStyles.muted}>{t.pauseHint}</p>
      <Button variant="ghost" onClick={() => setShowHow(!showHow)} aria-expanded={showHow}>
        {t.howItWorks}
      </Button>
      {showHow && <p className={listStyles.muted}>{t.explain}</p>}
      <Button
        variant="ghost"
        onClick={() => setShowSettings(!showSettings)}
        aria-expanded={showSettings}
      >
        {t.settings}
      </Button>
      {showSettings && (
        <>
          <NumberField
            label={t.window}
            value={data.N}
            onChange={(v) =>
              v !== null &&
              v >= 14 &&
              v <= 28 &&
              void repos.settings.set(SETTINGS.tdeeWindowDays.key, Math.round(v))
            }
            hint="14–28"
          />
          <NumberField
            label={t.rho}
            value={data.rho}
            onChange={(v) =>
              v !== null &&
              v >= 5000 &&
              v <= 9000 &&
              void repos.settings.set(SETTINGS.tdeeRho.key, Math.round(v))
            }
          />
        </>
      )}
    </Card>
  );
}

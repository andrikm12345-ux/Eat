import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repos } from '../../db/repos';
import { SETTINGS } from '../../db/settingsKeys';
import { ru } from '../../i18n/ru';
import { buildRemindersIcs, shareOrDownload } from '../../services/ics';
import { toast } from '../../state/ui';
import { Button, Card, Notice, OptionList, Switch, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.reminders;

function useSettings() {
  return useLiveQuery(async () => {
    const get = <K extends keyof typeof SETTINGS>(k: K) =>
      repos.settings.get(SETTINGS[k].key, SETTINGS[k].def as (typeof SETTINGS)[K]['def']);
    const [weighTime, measureWeekday, reviewWeekday, reviewTime, notify, badge, confetti, vibrate] =
      await Promise.all([
        get('weighTime'),
        get('measureWeekday'),
        get('reviewWeekday'),
        get('reviewTime'),
        get('notifyWhileOpen'),
        get('badgeMode'),
        get('confetti'),
        get('vibrate'),
      ]);
    return {
      weighTime,
      measureWeekday,
      reviewWeekday,
      reviewTime,
      notify,
      badge,
      confetti,
      vibrate,
    };
  }, []);
}

const set = (k: keyof typeof SETTINGS, v: unknown) => void repos.settings.set(SETTINGS[k].key, v);

export default function RemindersPage() {
  const s = useSettings();
  const [denied, setDenied] = useState(false);
  if (!s) return <Page title={t.title}>{ru.common.loading}</Page>;
  const weekdaySelect = (id: string, label: string, value: number, key: keyof typeof SETTINGS) => (
    <div style={{ marginBottom: 12 }}>
      <label className={styles.muted} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        onChange={(e) => set(key, Number(e.target.value))}
      >
        {ru.measure.weekdays.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
  const badgeSupported =
    typeof (navigator as Navigator & { setAppBadge?: unknown }).setAppBadge === 'function';

  return (
    <Page title={t.title}>
      <Card title={t.calendarTitle}>
        <p className={styles.muted}>{t.calendarHint}</p>
        <TextField
          label={t.weighTime}
          type="time"
          value={s.weighTime}
          onChange={(v) => v && set('weighTime', v)}
        />
        {weekdaySelect('m-day', t.measureDay, s.measureWeekday, 'measureWeekday')}
        {weekdaySelect('r-day', t.reviewDay, s.reviewWeekday, 'reviewWeekday')}
        <TextField
          label={t.reviewTime}
          type="time"
          value={s.reviewTime}
          onChange={(v) => v && set('reviewTime', v)}
        />
        <Button
          block
          onClick={async () => {
            await shareOrDownload(
              'dnevnik-reminders.ics',
              'text/calendar',
              await buildRemindersIcs(repos),
            );
            toast({ text: t.downloaded });
          }}
        >
          {t.download}
        </Button>
      </Card>
      <Card title={t.notifyTitle}>
        <Switch
          label={t.notify}
          hint={t.notifyHint}
          checked={s.notify}
          onChange={async (v) => {
            if (v && 'Notification' in window && Notification.permission !== 'granted') {
              const p = await Notification.requestPermission();
              if (p !== 'granted') {
                setDenied(true);
                return;
              }
            }
            set('notifyWhileOpen', v);
          }}
        />
        {denied && <Notice>{t.notifyDenied}</Notice>}
      </Card>
      <Card title={t.badgeTitle}>
        {!badgeSupported && <p className={styles.muted}>{t.badgeUnsupported}</p>}
        <OptionList
          label={t.badgeTitle}
          value={s.badge}
          onChange={(v) => set('badgeMode', v)}
          options={(['none', 'protein', 'weigh'] as const).map((v) => ({
            value: v,
            title: t.badge[v],
          }))}
        />
      </Card>
      <Card title={t.celebrate}>
        <Switch label={t.confetti} checked={s.confetti} onChange={(v) => set('confetti', v)} />
        <Switch label={t.vibrate} checked={s.vibrate} onChange={(v) => set('vibrate', v)} />
      </Card>
    </Page>
  );
}

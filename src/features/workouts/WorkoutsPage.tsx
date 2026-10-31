import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, formatDateRu, isLocalDate, toLocalDate, toLocalTime } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { MET_TABLE, metKcal } from '../../domain/met';
import { repos } from '../../db/repos';
import { useLatestWeight } from '../../db/hooks';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, Card, LinkButton, NumberField, Row, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.workouts;

export default function WorkoutsPage() {
  const from = addDays(toLocalDate(new Date()), -60);
  const list = useLiveQuery(
    async () =>
      (await repos.workouts.list())
        .filter((w) => w.date >= from)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [from],
  );
  return (
    <Page title={t.title}>
      <div className={styles.actions}>
        <LinkButton to="/workouts/new">{t.new}</LinkButton>
      </div>
      {list?.length === 0 && <p className={styles.muted}>{t.empty}</p>}
      {list && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((w) => (
            <li key={w.id} className={styles.row}>
              <div className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{w.type}</span>
                  <span className={styles.rowSub}>
                    {formatDateRu(w.date, 'd MMMM')} · {w.time} · {w.durationMin} {t.minutes}
                    {w.kcal ? ` · ${formatKcal(w.kcal)} ккал` : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  aria-label={`${ru.common.delete}: ${w.type}`}
                  onClick={async () => {
                    await repos.workouts.softDelete(w.id);
                    toast({
                      text: t.deleted,
                      action: { label: ru.common.undo, run: () => repos.workouts.restore(w.id) },
                    });
                  }}
                >
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function WorkoutNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const latest = useLatestWeight();
  const pDate = params.get('date');
  const [type, setType] = useState<string>(MET_TABLE[0].id);
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [kcal, setKcal] = useState<number | null>(null);
  const [date, setDate] = useState(pDate && isLocalDate(pDate) ? pDate : toLocalDate(new Date()));
  const [time, setTime] = useState(toLocalTime(new Date()));
  const [note, setNote] = useState('');
  const met = MET_TABLE.find((m) => m.id === type);
  const auto = met && minutes ? metKcal(met.met, latest?.kg ?? 70, minutes) : null;
  const name = type === 'custom' ? custom.trim() : (met?.name ?? '');
  const valid = !!name && !!minutes && minutes > 0;

  async function save() {
    if (!valid) return;
    const k = kcal ?? auto;
    await repos.workouts.create({
      date,
      time,
      type: name,
      durationMin: Math.round(minutes as number),
      source: 'manual',
      ...(k ? { kcal: Math.round(k) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    toast({ text: t.saved });
    navigate(-1);
  }

  return (
    <Page title={t.new}>
      <Card>
        <label className={styles.muted} htmlFor="wtype">
          {t.type}
        </label>
        <select
          id="wtype"
          className={styles.input}
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          {MET_TABLE.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="custom">{t.custom}</option>
        </select>
        {type === 'custom' && (
          <TextField label={t.customName} value={custom} onChange={setCustom} />
        )}
        <NumberField label={t.duration} suffix={t.minutes} value={minutes} onChange={setMinutes} />
        <NumberField
          label={t.kcal}
          suffix="ккал"
          value={kcal}
          onChange={setKcal}
          hint={auto ? t.kcalAuto(formatKcal(auto)) : undefined}
        />
        <Row>
          <TextField label={ru.today.date} type="date" value={date} onChange={setDate} />
          <TextField label={ru.today.time} type="time" value={time} onChange={setTime} />
        </Row>
        <TextField label={t.note} value={note} onChange={setNote} />
      </Card>
      <Button block onClick={() => void save()} disabled={!valid}>
        {t.save}
      </Button>
    </Page>
  );
}

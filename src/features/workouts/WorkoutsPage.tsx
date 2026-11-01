import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, formatDateRu, isLocalDate, toLocalDate, toLocalTime } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { MET_TABLE, metKcal } from '../../domain/met';
import { cleanExercises, EXERCISE_PRESETS, formatExercises } from '../../domain/workout';
import type { ExerciseCaloriesMode } from '../../domain/types';
import { repos } from '../../db/repos';
import { useLatestWeight, useProfile } from '../../db/hooks';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, Card, LinkButton, NumberField, Row, Segmented, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.workouts;

type ExerciseDraft = {
  name: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
};
const EMPTY: ExerciseDraft = { name: '', sets: 3, reps: 10, weightKg: null };

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
                  {w.exercises?.length ? (
                    <span className={styles.rowSub}>{formatExercises(w.exercises)}</span>
                  ) : null}
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
  const profile = useProfile();
  const [type, setType] = useState<string>('calisthenics');
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
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
    const done = cleanExercises(
      exercises.map((e) => ({
        name: e.name,
        sets: e.sets ?? 0,
        reps: e.reps ?? 0,
        ...(e.weightKg ? { weightKg: e.weightKg } : {}),
      })),
    );
    await repos.workouts.create({
      date,
      time,
      type: name,
      durationMin: Math.round(minutes as number),
      source: 'manual',
      ...(k ? { kcal: Math.round(k) } : {}),
      ...(done.length ? { exercises: done } : {}),
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
      <Card title={t.exercises}>
        <p className={styles.muted}>{t.exercisesHint}</p>
        <div className={styles.chips}>
          {EXERCISE_PRESETS.slice(0, 4).map((name) => (
            <button
              key={name}
              type="button"
              className={styles.chip}
              onClick={() => setExercises((l) => [...l, { ...EMPTY, name }])}
            >
              + {name}
            </button>
          ))}
        </div>
        <datalist id="exercise-presets">
          {EXERCISE_PRESETS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {exercises.map((e, i) => {
          const patch = (p: Partial<ExerciseDraft>) =>
            setExercises((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className={styles.exercise}>
              <div className={styles.exerciseHead}>
                <TextField
                  label={t.exName}
                  value={e.name}
                  onChange={(v) => patch({ name: v })}
                  list="exercise-presets"
                />
                <button
                  type="button"
                  className={styles.exerciseRemove}
                  aria-label={t.removeExercise(e.name)}
                  onClick={() => setExercises((l) => l.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
              <div className={styles.exerciseNums}>
                <NumberField
                  label={t.sets}
                  value={e.sets}
                  onChange={(v) => patch({ sets: v })}
                  ariaLabel={`${t.sets}: ${e.name || i + 1}`}
                />
                <NumberField
                  label={t.reps}
                  value={e.reps}
                  onChange={(v) => patch({ reps: v })}
                  ariaLabel={`${t.reps}: ${e.name || i + 1}`}
                />
                <NumberField
                  label={t.weight}
                  suffix="кг"
                  value={e.weightKg}
                  onChange={(v) => patch({ weightKg: v })}
                  ariaLabel={`${t.weight}: ${e.name || i + 1}`}
                />
              </div>
            </div>
          );
        })}
        <Button variant="secondary" block onClick={() => setExercises((l) => [...l, EMPTY])}>
          {t.addExercise}
        </Button>
      </Card>
      {profile && (
        <Card title={t.modeTitle}>
          <Segmented
            label={t.modeTitle}
            value={profile.exerciseCaloriesMode}
            onChange={(m: ExerciseCaloriesMode) => {
              const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = profile;
              void repos.profile.save({ ...rest, exerciseCaloriesMode: m });
            }}
            options={(['none', 'half', 'full'] as const).map((m) => ({
              value: m,
              label: t.modeShort[m],
            }))}
          />
          <p className={styles.muted} style={{ margin: 0 }}>
            {t.modeHint}
          </p>
        </Card>
      )}
      <Button block onClick={() => void save()} disabled={!valid}>
        {t.save}
      </Button>
    </Page>
  );
}

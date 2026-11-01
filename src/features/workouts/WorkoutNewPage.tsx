import { useState, type ComponentType, type CSSProperties, type SVGProps } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { isLocalDate, toLocalDate, toLocalTime } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import { netKcal, WORKOUT_KINDS, type Intensity, type WorkoutKindId } from '../../domain/met';
import type { ExerciseCaloriesMode } from '../../domain/types';
import { cleanExercises, EXERCISE_PRESETS } from '../../domain/workout';
import { useLatestWeight, useProfile } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import {
  IconBars,
  IconBike,
  IconBolt,
  IconDumbbell,
  IconRun,
  IconStretch,
  IconSwim,
  IconWalk,
  IconYoga,
} from '../../ui/icons';
import { Button, Card, Collapsible, NumberField, Row, Segmented, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import w from './workout.module.css';

const t = ru.workouts;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
/** Each kind has its own icon and colour, so the screen is not one flat tone. */
const LOOK: Record<WorkoutKindId, { Icon: Icon; color: string }> = {
  bars: { Icon: IconBars, color: '#1f8f7e' },
  strength: { Icon: IconDumbbell, color: '#6b5ca5' },
  run: { Icon: IconRun, color: '#e0703a' },
  walk: { Icon: IconWalk, color: '#3f86d6' },
  bike: { Icon: IconBike, color: '#d49a1f' },
  swim: { Icon: IconSwim, color: '#1fa3c4' },
  yoga: { Icon: IconYoga, color: '#c2508f' },
  stretch: { Icon: IconStretch, color: '#6f9f3c' },
  other: { Icon: IconBolt, color: '#7d848a' },
};

const DURATIONS = [15, 30, 45, 60, 90];

type ExerciseDraft = {
  name: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
};
const EMPTY: ExerciseDraft = { name: '', sets: 3, reps: 10, weightKg: null };

const addMinutes = (time: string, min: number) => {
  const [h, m] = time.split(':').map(Number);
  const total = ((((h ?? 0) * 60 + (m ?? 0) + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function WorkoutNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const latest = useLatestWeight();
  const profile = useProfile();
  const pDate = params.get('date');
  const [kind, setKind] = useState<WorkoutKindId>('bars');
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState<number | null>(45);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [kcal, setKcal] = useState<number | null>(null);
  const [date, setDate] = useState(pDate && isLocalDate(pDate) ? pDate : toLocalDate(new Date()));
  const [start, setStart] = useState(() => addMinutes(toLocalTime(new Date()), -45));
  const [note, setNote] = useState('');
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);

  const k = WORKOUT_KINDS.find((x) => x.id === kind) ?? WORKOUT_KINDS[0];
  const met = k.met[intensity];
  const auto = minutes ? Math.round(netKcal(met, latest?.kg ?? 70, minutes)) : 0;
  const total = kcal ?? auto;
  const name = kind === 'other' ? custom.trim() || k.name : k.name;
  const valid = !!minutes && minutes > 0;

  async function save() {
    if (!valid) return;
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
      time: start,
      type: name,
      durationMin: Math.round(minutes as number),
      intensity,
      source: 'manual',
      ...(total > 0 ? { kcal: Math.round(total) } : {}),
      ...(done.length ? { exercises: done } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    toast({ text: t.saved });
    navigate(-1);
  }

  const exercisesUi = (
    <>
      <div className={styles.chips}>
        {EXERCISE_PRESETS.slice(0, 4).map((n) => (
          <button
            key={n}
            type="button"
            className={styles.chip}
            onClick={() => setExercises((l) => [...l, { ...EMPTY, name: n }])}
          >
            + {n}
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
    </>
  );

  return (
    <Page title={t.new}>
      <div className={w.kinds} role="group" aria-label={t.type}>
        {WORKOUT_KINDS.map((x) => {
          const { Icon, color } = LOOK[x.id];
          const on = x.id === kind;
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              className={`${w.kind} ${on ? w.kindOn : ''}`}
              style={{ '--c': color } as CSSProperties}
              onClick={() => setKind(x.id)}
            >
              <span className={w.kindIcon}>
                <Icon width={24} height={24} />
              </span>
              <span>{x.name}</span>
            </button>
          );
        })}
      </div>
      {kind === 'other' && <TextField label={t.customName} value={custom} onChange={setCustom} />}

      <Card>
        <Row>
          <TextField label={ru.today.date} type="date" value={date} onChange={setDate} />
          <TextField label={t.start} type="time" value={start} onChange={setStart} />
        </Row>
        <p className={w.label}>{t.duration}</p>
        <div className={w.durations} role="group" aria-label={t.duration}>
          {DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              className={`${w.duration} ${minutes === m ? w.durationOn : ''}`}
              onClick={() => setMinutes(m)}
            >
              {m} {t.minutes}
            </button>
          ))}
        </div>
        <NumberField
          label={t.durationCustom}
          suffix={t.minutes}
          value={minutes}
          onChange={setMinutes}
        />
        {valid && (
          <div className={w.timeline} aria-hidden="true">
            <b>{start}</b>
            <span className={w.track}>
              <i />
            </span>
            <span>
              {t.until} <b>{addMinutes(start, minutes as number)}</b>
            </span>
          </div>
        )}
      </Card>

      <Card title={t.intensity}>
        <Segmented
          label={t.intensity}
          value={intensity}
          onChange={setIntensity}
          options={(['light', 'moderate', 'hard'] as const).map((v) => ({
            value: v,
            label: t.intensityName[v],
          }))}
        />
        <p className={styles.muted} style={{ margin: 0 }}>
          {t.intensityHint[intensity]}
        </p>
      </Card>

      {k.exercises ? (
        <Card title={t.exercises}>
          <p className={styles.muted}>{t.exercisesHint}</p>
          {exercisesUi}
        </Card>
      ) : (
        <Collapsible title={t.exercises}>{exercisesUi}</Collapsible>
      )}

      <Collapsible title={t.more}>
        <NumberField
          label={t.kcal}
          suffix="ккал"
          value={kcal}
          onChange={setKcal}
          hint={t.kcalOwn}
        />
        <TextField label={t.note} value={note} onChange={setNote} />
      </Collapsible>

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
        {total > 0 ? t.saveWith(formatKcal(total)) : t.save}
      </Button>
      <p className={w.footnote}>{t.kcalNet}</p>
    </Page>
  );
}

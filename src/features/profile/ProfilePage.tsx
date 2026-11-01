import { useState } from 'react';
import { atwaterKcal } from '../../domain/nutrients';
import { formatDateRu, isLocalDate, toLocalDate } from '../../domain/dates';
import { formatKcal, formatKg, formatRate } from '../../domain/format';
import type { ActivityLevel, ExerciseCaloriesMode, Goal, Profile } from '../../domain/types';
import { useGoalFor, useGoals, useProfile } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Button, Card, LinkButton, Notice, NumberField, OptionList, Row, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { DateField } from '../../ui/DateTimeFields';

const t = ru.goals;

export default function ProfilePage() {
  const today = toLocalDate(new Date());
  const profile = useProfile();
  const goal = useGoalFor(today);
  const goals = useGoals();
  const [manual, setManual] = useState(false);

  if (profile === undefined || goal === undefined || goals === undefined) {
    return <Page title={t.title}>{ru.common.loading}</Page>;
  }

  return (
    <Page title={t.title}>
      <Card title={t.current}>
        {goal ? <GoalView goal={goal} /> : <p>{t.none}</p>}
        <Row>
          <LinkButton to="/wizard" variant="secondary">
            {t.runWizard}
          </LinkButton>
          <Button variant="secondary" onClick={() => setManual((v) => !v)} aria-expanded={manual}>
            {t.editManual}
          </Button>
        </Row>
      </Card>

      {manual && <ManualGoal base={goal ?? null} today={today} onDone={() => setManual(false)} />}

      {profile && <ProfileForm profile={profile} />}

      {goals.length > 0 && (
        <Card title={t.history}>
          {goals.map((g) => (
            <Stat
              key={g.id}
              label={`${formatDateRu(g.validFrom)} · ${t.source[g.source]}`}
              value={`${formatKcal(g.kcal)} ${ru.units.kcal}`}
            />
          ))}
        </Card>
      )}
    </Page>
  );
}

function GoalView({ goal }: { goal: Goal }) {
  return (
    <div style={{ marginBottom: 'var(--sp-3)' }}>
      <Stat
        label={ru.goalType[goal.type]}
        value={`${formatRate(goal.rateKgPerWeek)} ${ru.units.kgPerWeek}`}
      />
      <Stat label={ru.wizard.summaryKcal} value={`${formatKcal(goal.kcal)} ${ru.units.kcal}`} />
      <Stat
        label={`${ru.wizard.protein} / ${ru.wizard.fat} / ${ru.wizard.carbs}`}
        value={`${goal.protein} / ${goal.fat} / ${goal.carbs} ${ru.units.g}`}
      />
      {goal.fiber !== undefined && (
        <Stat label={ru.wizard.fiber} value={`${goal.fiber} ${ru.units.g}`} />
      )}
      {goal.targetWeightKg !== undefined && (
        <Stat label={t.targetWeight} value={`${formatKg(goal.targetWeightKg)} ${ru.units.kg}`} />
      )}
      <Stat label={t.validFrom(formatDateRu(goal.validFrom))} value="" />
    </div>
  );
}

function ManualGoal({
  base,
  today,
  onDone,
}: {
  base: Goal | null;
  today: string;
  onDone: () => void;
}) {
  const [validFrom, setValidFrom] = useState(today);
  const [kcal, setKcal] = useState<number | null>(base?.kcal ?? null);
  const [protein, setProtein] = useState<number | null>(base?.protein ?? null);
  const [fat, setFat] = useState<number | null>(base?.fat ?? null);
  const [carbs, setCarbs] = useState<number | null>(base?.carbs ?? null);
  const [fiber, setFiber] = useState<number | null>(base?.fiber ?? null);
  const [water, setWater] = useState<number | null>(base?.waterMl ?? null);
  const [target, setTarget] = useState<number | null>(base?.targetWeightKg ?? null);

  const valid =
    isLocalDate(validFrom) &&
    kcal !== null &&
    kcal > 0 &&
    protein !== null &&
    fat !== null &&
    carbs !== null;
  const calc =
    protein !== null && fat !== null && carbs !== null
      ? atwaterKcal({ protein, fat, carbs })
      : null;
  const mismatch = kcal && calc !== null && Math.abs(calc - kcal) / kcal > 0.1;

  async function save() {
    if (!valid) return;
    await repos.goals.create({
      validFrom,
      type: base?.type ?? 'maintain',
      rateKgPerWeek: base?.rateKgPerWeek ?? 0,
      kcal,
      protein,
      fat,
      carbs,
      ...(fiber !== null ? { fiber } : {}),
      ...(water !== null ? { waterMl: water } : {}),
      ...(target !== null ? { targetWeightKg: target } : {}),
      source: 'manual',
    });
    onDone();
  }

  return (
    <Card title={t.manualTitle}>
      <DateField
        label={t.manualValidFrom}
        value={validFrom}
        onChange={setValidFrom}
        hint={t.manualHint}
      />
      <NumberField
        label={ru.wizard.summaryKcal}
        suffix={ru.units.kcal}
        value={kcal}
        onChange={setKcal}
      />
      <Row>
        <NumberField
          label={ru.wizard.protein}
          suffix={ru.units.g}
          value={protein}
          onChange={setProtein}
        />
        <NumberField label={ru.wizard.fat} suffix={ru.units.g} value={fat} onChange={setFat} />
        <NumberField
          label={ru.wizard.carbs}
          suffix={ru.units.g}
          value={carbs}
          onChange={setCarbs}
        />
      </Row>
      {mismatch && calc !== null && <Notice>{t.atwaterMismatch(formatKcal(calc))}</Notice>}
      <Row>
        <NumberField
          label={ru.wizard.fiber}
          suffix={ru.units.g}
          value={fiber}
          onChange={setFiber}
        />
        <NumberField label={t.water} suffix={ru.units.ml} value={water} onChange={setWater} />
      </Row>
      <NumberField
        label={t.targetWeight}
        suffix={ru.units.kg}
        value={target}
        onChange={setTarget}
      />
      <Row>
        <Button variant="secondary" onClick={onDone}>
          {ru.common.cancel}
        </Button>
        <Button onClick={() => void save()} disabled={!valid}>
          {t.manualSave}
        </Button>
      </Row>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const [birthDate, setBirthDate] = useState(profile.birthDate);
  const [height, setHeight] = useState<number | null>(profile.heightCm);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);
  const [mode, setMode] = useState<ExerciseCaloriesMode>(profile.exerciseCaloriesMode);
  const [saved, setSaved] = useState(false);
  const valid = isLocalDate(birthDate) && height !== null && height >= 100 && height <= 250;

  async function save() {
    if (!valid) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = profile;
    await repos.profile.save({
      ...rest,
      birthDate,
      heightCm: height,
      activityLevel: activity,
      exerciseCaloriesMode: mode,
    });
    setSaved(true);
  }

  const touch =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setSaved(false);
      fn(v);
    };

  return (
    <Card title={t.profileTitle}>
      <Stat label={ru.wizard.sexLabel} value={ru.sex[profile.sex]} />
      <DateField
        label={ru.wizard.birthDate}
        value={birthDate}
        max={toLocalDate(new Date())}
        onChange={touch(setBirthDate)}
      />
      <NumberField
        label={ru.wizard.height}
        suffix={ru.units.cm}
        value={height}
        onChange={touch(setHeight)}
      />
      <OptionList
        label={ru.wizard.activityLabel}
        value={activity}
        onChange={touch(setActivity)}
        options={(['sedentary', 'light', 'moderate', 'high', 'very_high'] as const).map((a) => ({
          value: a,
          title: ru.activity[a].title,
          hint: ru.activity[a].hint,
        }))}
      />
      <OptionList
        label={t.exerciseLabel}
        value={mode}
        onChange={touch(setMode)}
        options={(['none', 'half', 'full'] as const).map((m) => ({
          value: m,
          title: ru.exerciseMode[m].title,
          hint: ru.exerciseMode[m].hint,
        }))}
      />
      <Button block onClick={() => void save()} disabled={!valid}>
        {saved ? t.saved : t.profileSave}
      </Button>
    </Card>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { navyBodyFat } from '../../domain/body';
import { addDays, ageOn, formatDateRu, isLocalDate, toLocalDate } from '../../domain/dates';
import { PAL } from '../../domain/energy';
import { formatGrams, formatKcal, formatRate, formatSignedKcal } from '../../domain/format';
import {
  defaultRateKg,
  KCAL_PER_KG,
  planGoal,
  RATE_PCT,
  rateFromPct,
  type PlanWarning,
} from '../../domain/goalPlan';
import type { ActivityLevel, GoalType, Sex } from '../../domain/types';
import { useGoalFor, useLatestWeight, useProfile } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { requestPersistentStorage } from '../../pwa/storage';
import {
  Button,
  Card,
  Chips,
  Notice,
  NumberField,
  OptionList,
  Segmented,
  Stat,
} from '../../ui/kit';
import { saveWizard, type WizardData } from './saveWizard';
import { SkyHeader } from '../../ui/sky/SkyHeader';
import styles from './Wizard.module.css';
import { DateField } from '../../ui/DateTimeFields';
import { Loading } from '../../ui/states';

const t = ru.wizard;
const STEPS = ['about', 'weight', 'goal', 'body', 'summary'] as const;
const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'high', 'very_high'];

type Draft = Omit<WizardData, 'heightCm' | 'weightKg' | 'rateKgPerWeek'> & {
  heightCm: number | null;
  weightKg: number | null;
  rateKgPerWeek: number | null;
};

const inRange = (v: number | null, lo: number, hi: number): v is number =>
  v !== null && v >= lo && v <= hi;

export default function WizardPage() {
  const profile = useProfile();
  const latest = useLatestWeight();
  const today = toLocalDate(new Date());
  const goal = useGoalFor(today);
  if (profile === undefined || latest === undefined || goal === undefined) {
    return (
      <div className={styles.wrap}>
        <Loading />
      </div>
    );
  }
  const initial: Draft = {
    sex: profile?.sex ?? 'male',
    birthDate: profile?.birthDate ?? '',
    heightCm: profile?.heightCm ?? null,
    weightKg: latest?.kg ?? null,
    activityLevel: profile?.activityLevel ?? 'light',
    goalType: goal?.type ?? 'lose',
    rateKgPerWeek: goal ? Math.abs(goal.rateKgPerWeek) : null,
    targetWeightKg: goal?.targetWeightKg ?? null,
    neckCm: null,
    waistCm: null,
    hipsCm: null,
  };
  return <Wizard initial={initial} editing={!!profile} today={today} />;
}

function Wizard({ initial, editing, today }: { initial: Draft; editing: boolean; today: string }) {
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>(initial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const age = isLocalDate(d.birthDate) ? ageOn(d.birthDate, today) : null;
  const errors = {
    birthDate: age === null || age < 14 || age > 100 ? t.invalid.birthDate : null,
    height: inRange(d.heightCm, 100, 250) ? null : t.invalid.height,
    weight: inRange(d.weightKg, 30, 300) ? null : t.invalid.weight,
    rate:
      d.goalType === 'maintain' || d.rateKgPerWeek === null || inRange(d.rateKgPerWeek, 0, 2)
        ? null
        : t.invalid.rate,
    target:
      d.targetWeightKg === null || inRange(d.targetWeightKg, 30, 300) ? null : t.invalid.target,
  };
  const stepValid = [
    !errors.birthDate && !errors.height,
    !errors.weight,
    !errors.rate && !errors.target,
    true,
    true,
  ];

  const weight = d.weightKg ?? 70;
  const rateAbs = d.rateKgPerWeek ?? Math.abs(defaultRateKg(d.goalType, weight));
  const signedRate = d.goalType === 'lose' ? -rateAbs : d.goalType === 'gain' ? rateAbs : 0;
  const bodyFat = navyBodyFat({
    sex: d.sex,
    heightCm: d.heightCm ?? 0,
    neckCm: d.neckCm,
    waistCm: d.waistCm,
    hipsCm: d.hipsCm,
  });

  const plan = useMemo(
    () =>
      stepValid[0] && stepValid[1]
        ? planGoal({
            sex: d.sex,
            birthDate: d.birthDate,
            heightCm: d.heightCm as number,
            weightKg: weight,
            activityLevel: d.activityLevel,
            goalType: d.goalType,
            rateKgPerWeek: signedRate,
            targetWeightKg: d.targetWeightKg,
            bodyFatPct: bodyFat,
            today,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, bodyFat, signedRate, today],
  );

  const name = STEPS[step] as (typeof STEPS)[number];
  const isLast = step === STEPS.length - 1;

  async function save() {
    if (!plan || plan.blocked) return;
    setSaving(true);
    try {
      await saveWizard(
        repos,
        {
          ...d,
          heightCm: d.heightCm as number,
          weightKg: weight,
          rateKgPerWeek: signedRate,
        },
        plan,
        today,
      );
      if (!editing) await requestPersistentStorage();
      navigate(editing ? '/more/profile' : '/', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <SkyHeader className={styles.skyTop}>
        <p className={styles.step}>
          {editing ? t.editTitle : t.title} · {t.stepOf(step + 1, STEPS.length)}
        </p>
        <div className={styles.progress} aria-hidden="true">
          <div
            className={styles.progressBar}
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h1 className={styles.title}>{t.steps[name]}</h1>
        <p className={styles.stepHint}>{t.stepHints[name]}</p>
      </SkyHeader>

      <div className={styles.body}>
        {name === 'about' && (
          <>
            {!editing && (
              <p className={styles.stepHint}>
                <Link to="/account">{ru.account.haveAccount}</Link>
              </p>
            )}
            <Segmented
              label={t.sexLabel}
              value={d.sex}
              onChange={(v: Sex) => set('sex', v)}
              options={[
                { value: 'male', label: ru.sex.male },
                { value: 'female', label: ru.sex.female },
              ]}
            />
            <DateField
              label={t.birthDate}
              value={d.birthDate}
              onChange={(v) => set('birthDate', v)}
              max={today}
              allowEmpty
            />
            <NumberField
              label={t.height}
              suffix={ru.units.cm}
              value={d.heightCm}
              onChange={(v) => set('heightCm', v)}
              error={d.heightCm !== null ? errors.height : null}
            />
          </>
        )}

        {name === 'weight' && (
          <>
            <NumberField
              label={t.weight}
              suffix={ru.units.kg}
              value={d.weightKg}
              onChange={(v) => set('weightKg', v)}
              error={d.weightKg !== null ? errors.weight : null}
            />
            <OptionList
              label={t.activityLabel}
              value={d.activityLevel}
              onChange={(v) => set('activityLevel', v)}
              options={ACTIVITY.map((a) => ({
                value: a,
                title: ru.activity[a].title,
                hint: ru.activity[a].hint,
              }))}
            />
          </>
        )}

        {name === 'goal' && (
          <>
            <Segmented
              label={t.goalLabel}
              value={d.goalType}
              onChange={(v: GoalType) => {
                setD((p) => ({ ...p, goalType: v, rateKgPerWeek: null }));
              }}
              options={(['lose', 'maintain', 'gain'] as const).map((g) => ({
                value: g,
                label: ru.goalType[g],
              }))}
            />
            {d.goalType !== 'maintain' && (
              <>
                <Chips
                  label={t.rateLabel}
                  value={rateAbs}
                  onChange={(v) => set('rateKgPerWeek', v)}
                  options={RATE_PCT[d.goalType].presets.map((pct) => {
                    const kg = Math.abs(rateFromPct(d.goalType, pct, weight));
                    return {
                      value: kg,
                      label: t.ratePreset(formatGrams(pct), formatRate(kg).replace('+', '')),
                    };
                  })}
                />
                <NumberField
                  label={t.rateCustom}
                  suffix={ru.units.kgPerWeek}
                  value={rateAbs}
                  onChange={(v) => set('rateKgPerWeek', v)}
                  error={errors.rate}
                />
              </>
            )}
            <NumberField
              label={t.targetWeight}
              suffix={ru.units.kg}
              value={d.targetWeightKg}
              onChange={(v) => set('targetWeightKg', v)}
              error={errors.target}
            />
            {plan?.warnings
              .filter((w) =>
                ['fastLoss', 'fastGain', 'slowRate', 'underweightLose', 'targetDirection'].includes(
                  w,
                ),
              )
              .map((w) => (
                <Notice key={w}>{ru.warnings[w]}</Notice>
              ))}
          </>
        )}

        {name === 'body' && (
          <>
            <NumberField
              label={t.neck}
              suffix={ru.units.cm}
              value={d.neckCm}
              onChange={(v) => set('neckCm', v)}
            />
            <NumberField
              label={t.waist}
              suffix={ru.units.cm}
              value={d.waistCm}
              onChange={(v) => set('waistCm', v)}
            />
            {d.sex === 'female' && (
              <NumberField
                label={t.hips}
                suffix={ru.units.cm}
                value={d.hipsCm}
                onChange={(v) => set('hipsCm', v)}
              />
            )}
            <p className={styles.explain}>
              {bodyFat !== null
                ? t.bodyFatEstimate(formatGrams(bodyFat))
                : d.sex === 'female'
                  ? t.bodyFatUnknownFemale
                  : t.bodyFatUnknown}
            </p>
          </>
        )}

        {name === 'summary' && plan && (
          <Summary
            plan={plan}
            goalType={d.goalType}
            activity={d.activityLevel}
            usedBodyFat={bodyFat !== null}
            today={today}
          />
        )}
      </div>

      <div className={styles.footer}>
        {step > 0 ? (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            {t.back}
          </Button>
        ) : editing ? (
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {ru.common.cancel}
          </Button>
        ) : null}
        {isLast ? (
          <Button onClick={() => void save()} disabled={!plan || plan.blocked || saving}>
            {editing ? t.saveEdit : t.save}
          </Button>
        ) : (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!stepValid[step]}
            hint={ru.hints.step}
          >
            {t.next}
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({
  plan,
  goalType,
  activity,
  usedBodyFat,
  today,
}: {
  plan: ReturnType<typeof planGoal>;
  goalType: GoalType;
  activity: ActivityLevel;
  usedBodyFat: boolean;
  today: string;
}) {
  const m = plan.macros;
  const delta = (plan.rateKgPerWeek * KCAL_PER_KG) / 7;
  const shown: PlanWarning[] = plan.warnings;
  return (
    <>
      <p className={styles.big}>{formatKcal(plan.kcal)}</p>
      <p className={styles.bigLabel}>{t.summaryKcal}</p>
      <Card>
        <Stat label={t.protein} value={`${m.protein} ${ru.units.g}`} />
        <Stat label={t.fat} value={`${m.fat} ${ru.units.g}`} />
        <Stat label={t.carbs} value={`${m.carbs} ${ru.units.g}`} />
        <Stat label={t.fiber} value={`${m.fiber} ${ru.units.g}`} />
        <Stat
          label={t.water}
          value={`${formatKcal(m.waterRangeMl[0])}–${formatKcal(m.waterRangeMl[1])} ${ru.units.ml}`}
        />
      </Card>
      <p className={styles.explain}>
        {t.explainBmr(formatKcal(plan.bmr), usedBodyFat ? t.methodBoth : t.methodMifflin)}{' '}
        {t.explainTdee(String(PAL[activity]).replace('.', ','), formatKcal(plan.tdee))}{' '}
        {goalType === 'maintain'
          ? t.explainMaintain(formatKcal(plan.kcal))
          : t.explainRate(
              formatRate(plan.rateKgPerWeek),
              formatSignedKcal(delta),
              formatKcal(plan.kcal),
            )}
      </p>
      {plan.weeksToTarget !== null && (
        <p className={styles.explain}>
          {t.eta(plan.weeksToTarget, formatDateRu(addDays(today, plan.weeksToTarget * 7)))}
        </p>
      )}
      <p className={styles.explain}>{t.explainAdaptive}</p>
      {shown.map((w) => (
        <Notice key={w}>{ru.warnings[w]}</Notice>
      ))}
      {plan.blocked && <Notice>{t.blocked}</Notice>}
    </>
  );
}

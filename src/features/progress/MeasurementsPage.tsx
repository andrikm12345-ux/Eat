import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { leanMass, navyBodyFat } from '../../domain/body';
import { formatDateRu, toLocalDate } from '../../domain/dates';
import { formatGrams, formatKg } from '../../domain/format';
import type { Measurement, Sex } from '../../domain/types';
import { pickDailyWeights } from '../../domain/weightTrend';
import { useProfile } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button, Card, Notice, NumberField, Row, Stat, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import listStyles from '../add/add.module.css';

const t = ru.measure;
const FIELDS = ['neckCm', 'chestCm', 'waistCm', 'abdomenCm', 'hipsCm', 'thighCm', 'armCm'] as const;
type Field = (typeof FIELDS)[number];
const LABEL: Record<Field, string> = {
  neckCm: t.neck,
  chestCm: t.chest,
  waistCm: t.waist,
  abdomenCm: t.abdomen,
  hipsCm: t.hips,
  thighCm: t.thigh,
  armCm: t.arm,
};

export default function MeasurementsPage() {
  const profile = useProfile();
  const list = useLiveQuery(
    async () => (await repos.measurements.list()).sort((a, b) => b.date.localeCompare(a.date)),
    [],
  );
  const weights = useLiveQuery(() => repos.weights.list(), []);
  const [editing, setEditing] = useState<Measurement | 'new' | null>(null);
  if (!profile || !list || !weights) return <Page title={t.title}>{ru.common.loading}</Page>;
  const daily = pickDailyWeights(weights);
  const weightNear = (date: string) =>
    [...daily].reverse().find((w) => w.date <= date)?.kg ?? daily[0]?.kg;
  const latest = list[0];

  return (
    <Page title={t.title}>
      {latest?.bodyFatPct !== undefined && (
        <Card>
          <Stat
            label={`${t.bodyFat} (${formatDateRu(latest.date, 'd MMM')})`}
            value={`${formatGrams(latest.bodyFatPct)} %`}
          />
          {weightNear(latest.date) !== undefined && (
            <Stat
              label={t.lbm}
              value={`${formatKg(leanMass(weightNear(latest.date) as number, latest.bodyFatPct))} кг`}
            />
          )}
          <p className={listStyles.muted}>{t.bodyFatNote}</p>
        </Card>
      )}
      {editing ? (
        <MeasurementForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          sex={profile.sex}
          heightCm={profile.heightCm}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button block onClick={() => setEditing('new')}>
          {t.new}
        </Button>
      )}
      <h2 className={listStyles.sectionTitle}>{t.history}</h2>
      {list.length === 0 ? (
        <p className={listStyles.muted}>{t.empty}</p>
      ) : (
        <ul className={listStyles.list}>
          {list.map((m) => (
            <li key={m.id} className={listStyles.row}>
              <button type="button" className={listStyles.rowLink} onClick={() => setEditing(m)}>
                <span className={listStyles.rowMain}>
                  <span className={listStyles.rowName}>{formatDateRu(m.date)}</span>
                  <span className={listStyles.rowSub}>
                    {FIELDS.filter((f) => m[f] !== undefined)
                      .map((f) => `${LABEL[f].split(' (')[0]} ${formatGrams(m[f] as number)}`)
                      .join(' · ')}
                  </span>
                </span>
                {m.bodyFatPct !== undefined && (
                  <span className={listStyles.rowRight}>{formatGrams(m.bodyFatPct)} %</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function MeasurementForm({
  initial,
  sex,
  heightCm,
  onDone,
}: {
  initial: Measurement | null;
  sex: Sex;
  heightCm: number;
  onDone: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? toLocalDate(new Date()));
  const [v, setV] = useState<Record<Field, number | null>>(
    Object.fromEntries(FIELDS.map((f) => [f, initial?.[f] ?? null])) as Record<
      Field,
      number | null
    >,
  );
  const bf = navyBodyFat({ sex, heightCm, neckCm: v.neckCm, waistCm: v.waistCm, hipsCm: v.hipsCm });
  const any = FIELDS.some((f) => v[f] !== null && (v[f] as number) > 0);

  async function save() {
    const data: Omit<Measurement, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = { date };
    for (const f of FIELDS) {
      const x = v[f];
      if (x !== null && x > 0) data[f] = x;
    }
    if (bf !== null) {
      data.bodyFatPct = Math.round(bf * 10) / 10;
      data.method = 'navy';
    }
    if (initial) {
      await repos.measurements.update(initial.id, {
        ...data,
        bodyFatPct: data.bodyFatPct,
        method: data.method,
      });
    } else {
      await repos.measurements.create(data);
    }
    toast({ text: t.saved });
    onDone();
  }

  return (
    <Card title={initial ? t.edit : t.new}>
      <TextField label={t.date} type="date" value={date} onChange={setDate} />
      {FIELDS.map((f) =>
        f === 'hipsCm' || f === 'chestCm' ? null : (
          <NumberField
            key={f}
            label={LABEL[f]}
            suffix="см"
            value={v[f]}
            onChange={(x) => setV({ ...v, [f]: x })}
          />
        ),
      )}
      <Row>
        <NumberField
          label={t.chest}
          suffix="см"
          value={v.chestCm}
          onChange={(x) => setV({ ...v, chestCm: x })}
        />
        <NumberField
          label={t.hips}
          suffix="см"
          value={v.hipsCm}
          onChange={(x) => setV({ ...v, hipsCm: x })}
        />
      </Row>
      {bf !== null ? (
        <Notice tone="info">
          {t.bodyFat}: {formatGrams(bf)} % — {t.bodyFatNote}
        </Notice>
      ) : (
        <p className={listStyles.muted}>{t.needFor(sex)}</p>
      )}
      <Row>
        {initial ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await repos.measurements.softDelete(initial.id);
              toast({
                text: t.deleted,
                action: {
                  label: ru.common.undo,
                  run: () => repos.measurements.restore(initial.id),
                },
              });
              onDone();
            }}
          >
            {ru.common.delete}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onDone}>
            {ru.common.cancel}
          </Button>
        )}
        <Button onClick={() => void save()} disabled={!any || !date}>
          {t.save}
        </Button>
      </Row>
    </Card>
  );
}

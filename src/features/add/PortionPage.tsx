import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatGrams, formatKcal } from '../../domain/format';
import { isKcalInconsistent, scaleNutrients } from '../../domain/nutrients';
import type { Food } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logFood } from '../../services/entries';
import { toast, useUi } from '../../state/ui';
import { Button, Card, Chips, Notice, NumberField, Row, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from './addTarget';
import styles from './add.module.css';
import { DateField, TimeField } from '../../ui/DateTimeFields';

const t = ru.portion;

export default function PortionPage() {
  const { id } = useParams();
  const food = useLiveQuery(async () => (id ? ((await repos.foods.get(id)) ?? null) : null), [id]);
  if (food === undefined) return <Page title={t.title}>{ru.common.loading}</Page>;
  if (food === null) return <Page title={t.title}>{t.notFound}</Page>;
  return <Portion food={food} />;
}

function Portion({ food }: { food: Food }) {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDate = useUi((s) => s.setDate);
  const [unit, setUnit] = useState<string>('g');
  const [grams, setGrams] = useState<number | null>(
    food.lastGrams ?? food.servings[0]?.grams ?? 100,
  );
  const [count, setCount] = useState<number | null>(1);
  const [date, setD] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const serving = food.servings.find((s) => s.label === unit);
  const total = serving ? (count ?? 0) * serving.grams : (grams ?? 0);
  const n = scaleNutrients(food.per100g, total);
  const valid = total > 0 && total < 5000;

  async function add() {
    if (!valid) return;
    await logFood(repos, food, Math.round(total * 10) / 10, { date, time });
    setDate(date);
    toast({ text: t.added(food.name) });
    navigate('/');
  }

  return (
    <Page title={food.name}>
      {food.brand && <p className={styles.muted}>{food.brand}</p>}
      {isKcalInconsistent(food.per100g) && <Notice>{ru.search.inconsistent}</Notice>}
      {food.servings.length > 0 && (
        <Chips
          label={t.unit}
          value={unit}
          onChange={setUnit}
          options={[
            { value: 'g', label: t.gramsUnit },
            ...food.servings.map((s) => ({
              value: s.label,
              label: `${s.label} (${formatGrams(s.grams)} г)`,
            })),
          ]}
        />
      )}
      {serving ? (
        <NumberField label={t.count} value={count} onChange={setCount} suffix={serving.label} />
      ) : (
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={t.minus}
            onClick={() => setGrams(Math.max(0, (grams ?? 0) - 10))}
          >
            −
          </button>
          <NumberField
            label={t.grams}
            value={grams}
            onChange={setGrams}
            suffix={t.gramsUnit}
            autoFocus
          />
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={t.plus}
            onClick={() => setGrams((grams ?? 0) + 10)}
          >
            +
          </button>
        </div>
      )}
      <Card>
        <p className={styles.big}>
          {formatKcal(n.kcal)} {ru.units.kcal}
        </p>
        <Stat label={ru.foods.protein} value={`${formatGrams(n.protein)} г`} />
        <Stat label={ru.foods.fat} value={`${formatGrams(n.fat)} г`} />
        <Stat label={ru.foods.carbs} value={`${formatGrams(n.carbs)} г`} />
        {n.fiber !== undefined && (
          <Stat label={ru.foods.fiber} value={`${formatGrams(n.fiber)} г`} />
        )}
      </Card>
      <Row>
        <DateField label={ru.today.date} value={date} onChange={setD} />
        <TimeField label={ru.today.time} value={time} onChange={setTime} />
      </Row>
      <Button block onClick={() => void add()} disabled={!valid}>
        {t.add}
      </Button>
    </Page>
  );
}

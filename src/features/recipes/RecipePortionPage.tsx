import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { formatGrams, formatKcal } from '../../domain/format';
import { scaleNutrients } from '../../domain/nutrients';
import type { Recipe } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logRecipe } from '../../services/recipes';
import { toast, useUi } from '../../state/ui';
import { Button, Card, Chips, NumberField, Row, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import { DateField, TimeField } from '../../ui/DateTimeFields';

const t = ru.recipes;

export default function RecipePortionPage() {
  const { id } = useParams();
  const recipe = useLiveQuery(
    async () => (id ? ((await repos.recipes.get(id)) ?? null) : null),
    [id],
  );
  if (recipe === undefined) return <Page title={t.edit}>{ru.common.loading}</Page>;
  if (!recipe) return <Page title={t.edit}>{ru.portion.notFound}</Page>;
  return <Portion recipe={recipe} />;
}

function Portion({ recipe }: { recipe: Recipe }) {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDate = useUi((s) => s.setDate);
  const servingG =
    (recipe.cookedWeightG ?? 0) > 0
      ? (recipe.cookedWeightG as number) / recipe.servingsCount
      : null;
  const [unit, setUnit] = useState<'serving' | 'g'>(servingG ? 'serving' : 'g');
  const [count, setCount] = useState<number | null>(1);
  const [grams, setGrams] = useState<number | null>(servingG ?? 200);
  const [date, setD] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const total = unit === 'serving' && servingG ? (count ?? 0) * servingG : (grams ?? 0);
  const n = scaleNutrients(recipe.per100g, total);
  return (
    <Page title={recipe.name}>
      {servingG && (
        <Chips
          label={ru.portion.unit}
          value={unit}
          onChange={setUnit}
          options={[
            { value: 'serving', label: `${t.serving} (${formatGrams(servingG)} г)` },
            { value: 'g', label: 'г' },
          ]}
        />
      )}
      {unit === 'serving' && servingG ? (
        <NumberField label={ru.portion.count} value={count} onChange={setCount} />
      ) : (
        <NumberField label={ru.portion.grams} suffix="г" value={grams} onChange={setGrams} />
      )}
      <Card>
        <Stat label={ru.foods.kcal} value={`${formatKcal(n.kcal)} ккал`} />
        <Stat
          label={`${ru.foods.protein} / ${ru.foods.fat} / ${ru.foods.carbs}`}
          value={`${formatGrams(n.protein)} / ${formatGrams(n.fat)} / ${formatGrams(n.carbs)} г`}
        />
      </Card>
      <Row>
        <DateField label={ru.today.date} value={date} onChange={setD} />
        <TimeField label={ru.today.time} value={time} onChange={setTime} />
      </Row>
      <Button
        block
        disabled={!(total > 0)}
        onClick={async () => {
          await logRecipe(repos, recipe, Math.round(total), { date, time });
          setDate(date);
          toast({ text: ru.portion.added(recipe.name) });
          navigate('/');
        }}
      >
        {ru.portion.add}
      </Button>
    </Page>
  );
}

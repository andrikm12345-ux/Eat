import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { Button } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { addQs, useAddTarget } from '../add/addTarget';
import { FoodForm, type FoodDraft } from './FoodForm';

const t = ru.foods;

/** /foods/new (optionally `?log=1&barcode=…`) and /foods/:id/edit */
export default function FoodEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const target = useAddTarget();
  const food = useLiveQuery(async () => (id ? ((await repos.foods.get(id)) ?? null) : null), [id]);
  const log = params.get('log') === '1';

  if (id && food === undefined) return <Page title={t.edit}>{ru.common.loading}</Page>;

  const initial: FoodDraft = food
    ? {
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        per100g: food.per100g,
        servings: food.servings,
      }
    : {
        name: params.get('name') ?? '',
        barcode: params.get('barcode') ?? undefined,
        per100g: {},
        servings: [],
      };

  return (
    <Page title={food ? t.edit : t.new}>
      <FoodForm
        key={food?.id ?? 'new'}
        initial={initial}
        saveLabel={log ? t.saveAndLog : t.save}
        extraActions={
          food ? (
            <Button
              variant="secondary"
              onClick={async () => {
                await repos.foods.softDelete(food.id);
                toast({
                  text: t.deleted,
                  action: { label: ru.common.undo, run: () => repos.foods.restore(food.id) },
                });
                navigate('/foods', { replace: true });
              }}
            >
              {ru.common.delete}
            </Button>
          ) : undefined
        }
        onSave={async (d) => {
          if (food) {
            await repos.foods.edit(food.id, {
              ...d,
              brand: d.brand,
              barcode: d.barcode,
              verified: true,
            });
            toast({ text: t.saved });
            navigate(-1);
            return;
          }
          const created = await repos.foods.add({ ...d, source: 'user', verified: true });
          toast({ text: t.saved });
          navigate(log ? `/add/food/${created.id}${addQs(target.date, target.time)}` : '/foods', {
            replace: true,
          });
        }}
      />
    </Page>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import type { Food } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { FoodRow } from '../add/FoodRow';
import styles from '../add/add.module.css';
import { EmptyState, Loading } from '../../ui/states';

async function removeFood(f: Food) {
  await repos.foods.softDelete(f.id);
  toast({
    text: ru.foods.deleted,
    action: { label: ru.common.undo, run: () => repos.foods.restore(f.id) },
  });
}

export default function FoodsPage() {
  const foods = useLiveQuery(
    async () =>
      (await repos.foods.list())
        .filter((f) => f.source !== 'base')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [],
  );
  return (
    <Page title={ru.foods.title}>
      {foods === undefined && <Loading />}
      {foods && foods.length > 0 && (
        <div className={styles.actions}>
          <LinkButton to="/foods/new">{ru.foods.new}</LinkButton>
        </div>
      )}
      {foods && foods.length === 0 && (
        <EmptyState
          kind="foods"
          text={ru.foods.empty}
          action={{ label: ru.foods.new, to: '/foods/new' }}
        />
      )}
      {foods && foods.length > 0 && (
        <ul className={styles.list}>
          {foods.map((f) => (
            <FoodRow key={f.id} food={f} to={`/foods/${f.id}/edit`} onDelete={removeFood} />
          ))}
        </ul>
      )}
    </Page>
  );
}

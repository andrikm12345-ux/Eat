import { useLiveQuery } from 'dexie-react-hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { FoodRow } from '../add/FoodRow';
import styles from '../add/add.module.css';
import { EmptyState, Loading } from '../../ui/states';

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
            <FoodRow key={f.id} food={f} to={`/foods/${f.id}/edit`} />
          ))}
        </ul>
      )}
    </Page>
  );
}

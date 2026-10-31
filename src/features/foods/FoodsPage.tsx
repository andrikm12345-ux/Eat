import { useLiveQuery } from 'dexie-react-hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { FoodRow } from '../add/FoodRow';
import styles from '../add/add.module.css';

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
      <div className={styles.actions}>
        <LinkButton to="/foods/new">{ru.foods.new}</LinkButton>
      </div>
      {foods && foods.length === 0 && <p className={styles.muted}>{ru.foods.empty}</p>}
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

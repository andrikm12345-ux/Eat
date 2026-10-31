import { useLiveQuery } from 'dexie-react-hooks';
import { formatKcal } from '../../domain/format';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import styles from '../add/add.module.css';
import { Link } from 'react-router';

const t = ru.recipes;

/** /recipes (manage) and /add/recipe (pick to log). */
export default function RecipesPage({ pick = false }: { pick?: boolean }) {
  const { qs } = useAddTarget();
  const list = useLiveQuery(
    async () => (await repos.recipes.list()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [],
  );
  return (
    <Page title={pick ? t.pick : t.title}>
      <div className={styles.actions}>
        <LinkButton to="/recipes/new">{t.new}</LinkButton>
      </div>
      {list?.length === 0 && <p className={styles.muted}>{t.empty}</p>}
      {list && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((rc) => (
            <li key={rc.id} className={styles.row}>
              <Link
                className={styles.rowLink}
                to={pick ? `/add/recipe/${rc.id}${qs}` : `/recipes/${rc.id}/edit`}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{rc.name}</span>
                  <span className={styles.rowSub}>
                    {ru.search.per100(formatKcal(rc.per100g.kcal))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function PickRecipePage() {
  return <RecipesPage pick />;
}

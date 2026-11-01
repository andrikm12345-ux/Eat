import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router';
import { formatKcal } from '../../domain/format';
import { emptyNutrients, sumNutrients } from '../../domain/nutrients';
import type { Template } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { templateToDraft } from '../../services/recipes';
import { useReview } from '../../state/review';
import { toast } from '../../state/ui';
import { Button } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import styles from '../add/add.module.css';
import { EmptyState, Loading } from '../../ui/states';

const t = ru.templates;

/** /templates (manage) and /add/template (pick → review). */
export default function TemplatesPage({ pick = false }: { pick?: boolean }) {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const list = useLiveQuery(
    async () => (await repos.templates.list()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [],
  );

  const use = (tpl: Template) => {
    setDraft(templateToDraft(tpl, target.date, target.time));
    navigate('/review');
  };

  return (
    <Page title={pick ? t.pick : t.title}>
      {list === undefined && <Loading />}
      {list?.length === 0 && (
        <EmptyState kind="templates" text={t.empty} action={{ label: t.toDiary, to: '/' }} />
      )}
      {list && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((tpl) => {
            const items = tpl.items ?? [];
            const kcal = sumNutrients(items.map((i) => i.snapshot ?? emptyNutrients())).kcal;
            return (
              <li key={tpl.id} className={styles.row}>
                <div className={styles.rowLink}>
                  <button
                    type="button"
                    className={styles.rowLink}
                    style={{ padding: '0' }}
                    onClick={() => use(tpl)}
                  >
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{tpl.name}</span>
                      <span className={styles.rowSub}>
                        {t.items(items.length)} · {formatKcal(kcal)} ккал
                      </span>
                    </span>
                  </button>
                  {!pick && (
                    <Button
                      variant="text"
                      aria-label={`${ru.common.delete}: ${tpl.name}`}
                      onClick={async () => {
                        await repos.templates.softDelete(tpl.id);
                        toast({
                          text: t.deleted,
                          action: {
                            label: ru.common.undo,
                            run: () => repos.templates.restore(tpl.id),
                          },
                        });
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

export function PickTemplatePage() {
  return <TemplatesPage pick />;
}

import { ru } from '../../i18n/ru';
import type { CookHistoryEntry } from '../../services/cookHistory';
import { Card, Collapsible } from '../../ui/kit';
import styles from './admin.module.css';

const t = ru.admin;

function conditions(c: CookHistoryEntry['conditions']): string {
  const parts = [t.cookCond.servings(c.servings)];
  if (c.maxMinutes) parts.push(t.cookCond.time(c.maxMinutes));
  if (c.meal !== 'any') parts.push(ru.cook.meals[c.meal].toLowerCase());
  if (c.noBuy) parts.push(t.cookCond.noBuy);
  if (!c.basics) parts.push(t.cookCond.noBasics);
  if (c.wishes) parts.push(t.cookCond.wishes(c.wishes));
  return parts.join(' · ');
}

/** What the person wrote into «Что приготовить» and what the AI gave back (read only). */
export function AdminCookHistory({ history }: { history: CookHistoryEntry[] }) {
  return (
    <Card title={t.cookTitle}>
      {history.length === 0 && <p className={styles.muted}>{t.cookNone}</p>}
      {history.map((h) => (
        <div key={h.id} className={styles.meal}>
          <div className={styles.mealHead}>
            <span>{new Date(h.at).toLocaleString('ru-RU')}</span>
          </div>
          <span className={styles.sub}>
            <strong>{t.cookPantry}:</strong> {h.pantry}
          </span>
          <span className={styles.sub}>{conditions(h.conditions)}</span>
          <span className={styles.sub}>
            <strong>{t.cookOffered}:</strong>
            {h.dishes.length === 0 ? ` ${t.cookNothing}` : ''}
          </span>
          {h.dishes.map((d) => (
            <span key={d.name} className={styles.sub}>
              • {d.name} · {ru.cook.minutes(d.minutes)} ·{' '}
              {t.cookKcal(String(d.kcal), String(d.protein).replace('.', ','))}
              {d.missing.length ? ` · ${t.cookMissing(d.missing.join(', '))}` : ''}
              {d.short.length ? ` · ${t.cookShort(d.short.join(', '))}` : ''}
            </span>
          ))}
          {h.rejected > 0 && <span className={styles.sub}>{t.cookRejected(h.rejected)}</span>}
          {h.recipes.map((r) => (
            <Collapsible key={r.name} title={t.cookRecipe(r.name, r.servings)}>
              <p className={styles.sub}>
                <strong>{t.cookIngredients}:</strong> {r.ingredients.join(', ')}
              </p>
              <ol className={styles.cookSteps}>
                {r.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {r.tip && (
                <p className={styles.sub}>
                  <strong>{t.cookTip}:</strong> {r.tip}
                </p>
              )}
            </Collapsible>
          ))}
        </div>
      ))}
    </Card>
  );
}

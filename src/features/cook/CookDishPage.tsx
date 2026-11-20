import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { amountText, checkDish, dishTotals, type CheckedIngredient } from '../../domain/cook';
import { formatGrams, formatKcal } from '../../domain/format';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { dishToDraft, loadSteps, saveDishAsRecipe } from '../../services/cook';
import { recordCookRecipe } from '../../services/cookHistory';
import { useCook } from '../../state/cook';
import { useReview } from '../../state/review';
import { toast } from '../../state/ui';
import { IconClock } from '../../ui/icons';
import { Button, Card, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import styles from './cook.module.css';

const t = ru.cook;
const g1 = (v: number) => formatGrams(Math.round(v * 10) / 10);

const STATUS_CLASS: Record<CheckedIngredient['status'], string> = {
  have: styles.sHave ?? '',
  basic: styles.sBasic ?? '',
  short: styles.sShort ?? '',
  missing: styles.sMissing ?? '',
  optional: styles.sOptional ?? '',
};

const amountOf = (i: CheckedIngredient, servings: number) => amountText(i, servings);

function haveOf(i: CheckedIngredient) {
  if (!i.have) return null;
  if (i.have.pieces !== undefined) return t.haveAmount(t.pieces(g1(i.have.pieces)));
  if (i.have.grams !== undefined) return t.haveAmount(`${g1(i.have.grams)} г`);
  return null;
}

export default function CookDishPage() {
  const navigate = useNavigate();
  const target = useAddTarget();
  const dish = useCook((s) => s.dish);
  const result = useCook((s) => s.result);
  const cached = useCook((s) => (dish ? s.steps[dish.idea.name] : undefined));
  const putSteps = useCook((s) => s.putSteps);
  const setDraft = useReview((s) => s.setDraft);
  const [servings, setServings] = useState(result?.servings ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The list was scrolled down: the recipe starts at its top.
  useEffect(() => {
    document.scrollingElement?.scrollTo?.(0, 0);
  }, [dish?.idea.name]);

  // Opened directly (a reload): back to the search.
  useEffect(() => {
    if (!dish) navigate(`/cook${target.qs}`, { replace: true });
  }, [dish, navigate, target.qs]);

  // The steps are written once per dish and kept for the session.
  useEffect(() => {
    if (!dish || cached) return;
    let alive = true;
    loadSteps(repos, dish, result?.servings ?? 1).then(
      (s) => {
        if (alive) putSteps(dish.idea.name, s);
        if (result?.searchId)
          void recordCookRecipe(repos, result.searchId, dish, result.servings, s).catch(
            () => undefined,
          );
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per dish and retry
  }, [dish?.idea.name, attempt]);

  const checked = useMemo(
    () =>
      dish && result
        ? checkDish(dish.idea, result.pantry, { basics: result.basics, servings })
        : null,
    [dish, result, servings],
  );
  if (!dish || !checked) return null;
  const loading = !cached && !error;

  const per = dish.perServing;
  const total = dishTotals(dish.resolved, servings);

  async function save() {
    if (!dish || !cached) return;
    setSaving(true);
    try {
      const recipe = await saveDishAsRecipe(repos, dish, servings, cached);
      toast({
        text: t.saved,
        action: { label: t.open, run: () => navigate(`/recipes/${recipe.id}/edit`) },
      });
    } finally {
      setSaving(false);
    }
  }

  function log() {
    if (!dish) return;
    setDraft(dishToDraft(dish, target, t.logNote(dish.idea.name)));
    navigate('/review');
  }

  return (
    <Page title={dish.idea.name}>
      <p className={styles.meta}>
        <IconClock width={16} height={16} />
        {t.minutes(dish.idea.minutes)} · {t.difficulty[dish.idea.difficulty]}
      </p>
      <p className={styles.nutr}>
        {t.nutrition(formatKcal(per.kcal), g1(per.protein), g1(per.fat), g1(per.carbs))}{' '}
        <span className={styles.muted}>{t.perServing}</span>
      </p>

      <Card title={t.ingredients} tone="mint">
        <div className={styles.stepper} role="group" aria-label={ru.cook.servings}>
          <button
            type="button"
            aria-label="−"
            disabled={servings <= 1}
            onClick={() => setServings(servings - 1)}
          >
            −
          </button>
          <span>{t.forServings(servings)}</span>
          <button
            type="button"
            aria-label="+"
            disabled={servings >= 12}
            onClick={() => setServings(servings + 1)}
          >
            +
          </button>
        </div>
        <ul className={styles.ings}>
          {checked.ingredients.map((i, k) => (
            <li key={`${i.name}-${k}`} className={styles.ing}>
              <span className={`${styles.dot} ${STATUS_CLASS[i.status]}`} aria-hidden="true" />
              <span className={styles.ingName}>
                {i.name}
                <span className={styles.ingSub}>
                  {t.status[i.status]}
                  {i.status === 'short' && haveOf(i) ? ` · ${haveOf(i)}` : ''}
                </span>
              </span>
              <span className={styles.ingAmount}>{amountOf(i, servings)}</span>
            </li>
          ))}
        </ul>
        {servings > 1 && (
          <p className={styles.hint}>
            {t.total}:{' '}
            {t.nutrition(formatKcal(total.kcal), g1(total.protein), g1(total.fat), g1(total.carbs))}
          </p>
        )}
      </Card>

      <Card title={t.steps} tone="sun">
        {loading && <p className={styles.hint}>{t.stepsLoading}</p>}
        {error && (
          <>
            <Notice>{`${t.stepsError} ${error}`}</Notice>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setAttempt(attempt + 1);
              }}
            >
              {t.retry}
            </Button>
          </>
        )}
        {cached && (
          <>
            <ol className={styles.steps}>
              {cached.steps.map((s, k) => (
                <li key={k} className={styles.step}>
                  <span className={styles.stepNo}>{k + 1}</span>
                  <span className={styles.stepText}>
                    {s.text}
                    {s.minutes > 0 && (
                      <span className={styles.stepTime}>{t.minutes(s.minutes)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {cached.tip && (
              <p className={styles.tip}>
                <strong>{t.tip}:</strong> {cached.tip}
              </p>
            )}
          </>
        )}
        <p className={styles.hint}>{t.aiNote}</p>
      </Card>

      <div className={styles.actions}>
        <Button block onClick={log}>
          {t.log}
        </Button>
        <Button block variant="secondary" disabled={!cached || saving} onClick={() => void save()}>
          {t.save}
        </Button>
        <Link to={`/cook${target.qs}`} className={styles.back}>
          {t.back}
        </Link>
      </div>
    </Page>
  );
}

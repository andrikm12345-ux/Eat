import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { formatGrams, formatKcal } from '../../domain/format';
import { scaleNutrients, sumNutrients } from '../../domain/nutrients';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { saveAsTemplate } from '../../services/entries';
import { saveReview } from '../../services/review';
import { swapAlt, useReview, type ReviewDraft, type ReviewItem } from '../../state/review';
import { toast, useUi } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Card, Notice, NumberField, Row, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { FoodSearch } from '../add/SearchPage';
import styles from './review.module.css';

const t = ru.review;

export default function ReviewPage() {
  const draft = useReview((s) => s.draft);
  if (!draft) return <Navigate to="/" replace />;
  return <Review initial={draft} />;
}

const nutrientsOf = (i: ReviewItem) => scaleNutrients(i.per100g, i.grams);

function Review({ initial }: { initial: ReviewDraft }) {
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const setDate = useUi((s) => s.setDate);
  const [items, setItems] = useState(initial.items);
  const [date, setD] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [tplName, setTplName] = useState<string | null>(null);
  const run = useLiveQuery(
    async () => (initial.aiRunId ? await repos.db.aiRuns.get(initial.aiRunId) : undefined),
    [initial.aiRunId],
  );
  const totals = sumNutrients(items.map(nutrientsOf));
  const valid = items.length > 0 && items.every((i) => i.grams > 0);
  const update = (key: string, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function save(template?: string) {
    if (!valid) return;
    const e = await saveReview({ ...initial, items, date, time });
    if (template) await saveAsTemplate(repos, e, template);
    setDraft(null);
    setDate(date);
    toast({ text: template ? `${t.saved} · ${ru.today.templateSaved}` : t.saved });
    navigate('/', { replace: true });
  }

  function cancel() {
    setDraft(null);
    navigate(-1);
  }

  return (
    <Page title={t.title}>
      {initial.analysis === 'ai' && (
        <Notice tone="info">{run?.model ? t.byAi(run.model) : t.byAiNoModel}</Notice>
      )}
      {initial.analysis === 'local' && <Notice tone="info">{t.byCatalog}</Notice>}
      {items.some((i) => i.source === 'off') && <Notice tone="info">{t.unverified}</Notice>}
      {items.map((i) => {
        const n = nutrientsOf(i);
        const low = i.confidence === 'low';
        return (
          <div key={i.key} className={`${styles.item} ${low ? styles.low : ''}`}>
            <div className={styles.head}>
              <span className={styles.name}>{i.name}</span>
              <span className={styles.badge}>{t.source[i.source]}</span>
            </div>
            <p className={styles.meta}>
              {i.confidence ? t.confidence[i.confidence] : ''}
              {i.assumed ? ` · ${t.assumed}` : ''}
              {low ? ` · ${t.checkGrams}` : ''}
            </p>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.step}
                aria-label={`${ru.portion.minus}: ${i.name}`}
                onClick={() => update(i.key, { grams: Math.max(0, i.grams - 10) })}
              >
                −
              </button>
              <NumberField
                label={`${ru.portion.grams}: ${i.name}`}
                suffix="г"
                value={i.grams}
                emptyAs={0}
                onChange={(v) => update(i.key, { grams: v ?? 0 })}
              />
              <button
                type="button"
                className={styles.step}
                aria-label={`${ru.portion.plus}: ${i.name}`}
                onClick={() => update(i.key, { grams: i.grams + 10 })}
              >
                +
              </button>
            </div>
            <p className={styles.macros}>
              <b>{formatKcal(n.kcal)} ккал</b> · Б {formatGrams(n.protein)} · Ж {formatGrams(n.fat)}{' '}
              · У {formatGrams(n.carbs)}
            </p>
            {i.alt && (
              <Button
                variant="ghost"
                onClick={() =>
                  setItems((list) => list.map((x) => (x.key === i.key ? swapAlt(x) : x)))
                }
              >
                {i.alt.source === 'ai' ? ru.ai.useAi : ru.ai.useCatalog(i.alt.name)}
              </Button>
            )}
            <Row>
              <Button variant="ghost" onClick={() => setReplacing(i.key)}>
                {t.replace}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setItems(items.filter((x) => x.key !== i.key))}
              >
                {t.remove}
              </Button>
            </Row>
          </div>
        );
      })}
      <Card>
        <p className={styles.total}>
          {t.total}: <b>{formatKcal(totals.kcal)} ккал</b> · Б {formatGrams(totals.protein)} · Ж{' '}
          {formatGrams(totals.fat)} · У {formatGrams(totals.carbs)}
        </p>
        <Row>
          <TextField label={ru.today.date} type="date" value={date} onChange={setD} />
          <TextField label={ru.today.time} type="time" value={time} onChange={setTime} />
        </Row>
        {initial.notes && <p className={styles.notes}>{initial.notes}</p>}
      </Card>
      <div className={styles.actions}>
        <Button onClick={() => void save()} disabled={!valid}>
          {t.save}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setTplName(
              items
                .map((i) => i.name)
                .join(', ')
                .slice(0, 40),
            )
          }
          disabled={!valid}
        >
          {t.saveTemplate}
        </Button>
        <Button variant="ghost" onClick={cancel}>
          {ru.common.cancel}
        </Button>
      </div>

      <BottomSheet
        open={replacing !== null}
        title={t.replaceTitle}
        onClose={() => setReplacing(null)}
      >
        <FoodSearch
          autoFocus={false}
          onPick={(f) => {
            if (replacing)
              update(replacing, {
                name: f.name,
                per100g: f.per100g,
                foodId: f.id,
                source: 'catalog',
                confidence: undefined,
              });
            setReplacing(null);
          }}
        />
      </BottomSheet>
      <BottomSheet open={tplName !== null} title={t.saveTemplate} onClose={() => setTplName(null)}>
        <TextField label={t.templateName} value={tplName ?? ''} onChange={setTplName} autoFocus />
        <Button block disabled={!tplName?.trim()} onClick={() => void save(tplName?.trim())}>
          {ru.common.save}
        </Button>
      </BottomSheet>
    </Page>
  );
}

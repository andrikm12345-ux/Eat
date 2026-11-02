import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { formatGrams, formatKcal } from '../../domain/format';
import { scaleNutrients, sumNutrients } from '../../domain/nutrients';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { saveAsTemplate } from '../../services/entries';
import { ACCOUNT } from '../../services/account';
import { clarifyMeal } from '../../services/aiClarify';
import { additionItem, isDrink, type Addition } from '../../services/drinkAdditions';
import { hostOf } from '../../services/webSearch';
import { correctedKeys, saveReview } from '../../services/review';
import {
  swapAlt,
  useReview,
  withPer100,
  withPortionKcal,
  type ReviewDraft,
  type ReviewItem,
} from '../../state/review';
import { toast, useUi } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import {
  Button,
  Card,
  Chips,
  Notice,
  NumberField,
  Segmented,
  Switch,
  TextField,
} from '../../ui/kit';
import { useAiConfig } from '../ai/useAi';
import { Page } from '../../ui/Page';
import { FoodSearch } from '../add/SearchPage';
import styles from './review.module.css';
import { DateField, TimeField } from '../../ui/DateTimeFields';

const t = ru.review;

export default function ReviewPage() {
  const draft = useReview((s) => s.draft);
  if (!draft) return <Navigate to="/" replace />;
  return <Review initial={draft} />;
}

/** One link per site: several pages of the same site would only repeat its name. */
const uniqueHosts = (list: { title: string; url: string }[]) =>
  list.filter((s, i) => list.findIndex((x) => hostOf(x.url) === hostOf(s.url)) === i);

const dropAssumption = (i: ReviewItem): ReviewItem => {
  const { assumption: _gone, ...rest } = i;
  return rest;
};

const nutrientsOf = (i: ReviewItem) => scaleNutrients(i.per100g, i.grams);

function Review({ initial }: { initial: ReviewDraft }) {
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const setDate = useUi((s) => s.setDate);
  const [items, setItems] = useState(initial.items);
  // The AI estimate the user started from; corrections are measured against it.
  const [baseline, setBaseline] = useState(initial.items);
  const [runId, setRunId] = useState(initial.aiRunId);
  // The AI's remarks under the total; a recalculation brings new ones.
  const [notes, setNotes] = useState(initial.notes);
  const [sources, setSources] = useState(initial.sources);
  const [note, setNote] = useState('');
  const [clarifying, setClarifying] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const cfg = useAiConfig();
  const [date, setD] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [replacing, setReplacing] = useState<string | null>(null);
  // Count kept while the piece-weight field is emptied for retyping.
  const [heldCount, setHeldCount] = useState<Record<string, number>>({});
  const [modes, setModes] = useState<Record<string, 'pieces' | 'portion' | 'per100'>>({});
  const [tplName, setTplName] = useState<string | null>(null);
  const run = useLiveQuery(
    async () => (initial.aiRunId ? await repos.db.aiRuns.get(initial.aiRunId) : undefined),
    [initial.aiRunId],
  );
  const isAdmin = useLiveQuery(() => repos.settings.get<boolean>(ACCOUNT.aiAdmin, false), []);
  const totals = sumNutrients(items.map(nutrientsOf));
  const valid = items.length > 0 && items.every((i) => i.grams > 0);
  const update = (key: string, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const edit = (key: string, fn: (i: ReviewItem) => ReviewItem) =>
    setItems((list) => list.map((i) => (i.key === key ? fn(i) : i)));

  async function save(template?: string) {
    if (!valid) return;
    const fixed = correctedKeys(baseline, items);
    const e = await saveReview(
      {
        ...initial,
        items,
        date,
        time,
        ...(notes ? { notes } : {}),
        ...(runId ? { aiRunId: runId } : {}),
      },
      remember ? { remember: new Set(fixed) } : {},
    );
    if (template) await saveAsTemplate(repos, e, template);
    setDraft(null);
    setDate(date);
    const extra = remember && fixed.length > 0 ? ` · ${t.remembered}` : '';
    toast({ text: template ? `${t.saved} · ${ru.today.templateSaved}` : `${t.saved}${extra}` });
    navigate('/', { replace: true });
  }

  /** A drink's add-on becomes its own line under the drink; "no sugar" only confirms the guess. */
  async function addToDrink(key: string, kind: 'none' | Addition) {
    if (kind === 'none') {
      setItems((list) => list.map((x) => (x.key === key ? dropAssumption(x) : x)));
      return;
    }
    const extra = await additionItem(repos, kind);
    setItems((list) => {
      const at = list.findIndex((x) => x.key === key);
      if (at < 0) return list;
      const next = list.map((x) => (x.key === key ? dropAssumption(x) : x));
      next.splice(at + 1, 0, extra);
      return next;
    });
  }

  async function clarify() {
    if (note.trim().length < 3 || clarifying) return;
    setClarifying(true);
    setClarifyError(null);
    try {
      const src = initial.entrySource === 'ai_photo' ? 'ai_photo' : 'ai_text';
      const draft = await clarifyMeal(repos, items, note, { date, time }, src);
      setItems(draft.items);
      setBaseline(draft.items);
      setNotes(draft.notes);
      setSources(draft.sources);
      if (draft.aiRunId) setRunId(draft.aiRunId);
      setNote('');
      toast({ text: t.clarifyDone });
    } catch (e) {
      setClarifyError(t.clarifyFailed((e as Error).message));
    } finally {
      setClarifying(false);
    }
  }

  const canClarify = initial.analysis === 'ai' && !!cfg?.ready && cfg.consent;
  const fixedNow = correctedKeys(baseline, items);

  function cancel() {
    setDraft(null);
    navigate(-1);
  }

  return (
    <Page title={t.title}>
      {initial.analysis === 'ai' && (
        <Notice tone="info">{isAdmin && run?.model ? t.byAi(run.model) : t.byAiNoModel}</Notice>
      )}
      {initial.analysis === 'ai' && sources && sources.length > 0 && (
        <Notice tone="info">
          {t.webChecked}{' '}
          {uniqueHosts(sources).map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {hostOf(s.url)}
              </a>
            </span>
          ))}
        </Notice>
      )}
      {initial.analysis === 'local' && <Notice tone="info">{t.byCatalog}</Notice>}
      {items.some((i) => i.source === 'off') && <Notice tone="info">{t.unverified}</Notice>}
      {items.map((i) => {
        const n = nutrientsOf(i);
        const mode = modes[i.key] ?? (i.piece ? 'pieces' : 'portion');
        const pieceG = i.piece?.grams ?? 0;
        const count = pieceG > 0 ? Math.round((i.grams / pieceG) * 100) / 100 : 0;
        const setCount = (c: number) => {
          if (pieceG > 0) update(i.key, { grams: Math.round(Math.max(0, c) * pieceG * 10) / 10 });
        };
        const low = i.confidence === 'low' || !!i.assumption;
        return (
          <div key={i.key} className={`${styles.item} ${low ? styles.low : ''}`}>
            <div className={styles.head}>
              <span className={styles.name}>{i.name}</span>
              <span className={styles.badge}>{t.source[i.source]}</span>
            </div>
            <p className={styles.meta}>
              {i.confidence ? t.confidence[i.confidence] : ''}
              {i.assumed ? ` · ${t.assumed}` : ''}
              {i.assumption ? ` · ${t.assumptionLabel}: ${i.assumption}` : ''}
              {i.confidence === 'low' ? ` · ${t.checkGrams}` : ''}
              {i.site && (
                <>
                  {' · '}
                  {t.fromSite}{' '}
                  <a href={i.site.url} target="_blank" rel="noopener noreferrer">
                    {hostOf(i.site.url)}
                  </a>
                </>
              )}
            </p>
            <Segmented
              label={`${t.modeLabel}: ${i.name}`}
              value={mode}
              onChange={(v: 'pieces' | 'portion' | 'per100') =>
                setModes((m) => ({ ...m, [i.key]: v }))
              }
              options={[
                ...(i.piece ? [{ value: 'pieces' as const, label: t.modePieces }] : []),
                { value: 'portion' as const, label: i.piece ? t.modeGrams : t.modePortion },
                { value: 'per100' as const, label: t.mode100 },
              ]}
            />
            {mode === 'pieces' && i.piece && (
              <>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.step}
                    aria-label={`${ru.portion.minus}: ${i.name}`}
                    onClick={() => setCount(count - 1)}
                  >
                    −
                  </button>
                  <NumberField
                    label={t.piecesLabel}
                    ariaLabel={`${t.piecesLabel}: ${i.name}`}
                    suffix="шт"
                    value={count}
                    emptyAs={0}
                    onChange={(v) => setCount(v ?? 0)}
                  />
                  <button
                    type="button"
                    className={styles.step}
                    aria-label={`${ru.portion.plus}: ${i.name}`}
                    onClick={() => setCount(count + 1)}
                  >
                    +
                  </button>
                </div>
                <NumberField
                  label={t.pieceWeight}
                  ariaLabel={`${t.pieceWeight}: ${i.name}`}
                  suffix="г"
                  value={pieceG}
                  emptyAs={0}
                  onChange={(v) => {
                    if (!v || v <= 0) {
                      setHeldCount((m) => ({ ...m, [i.key]: m[i.key] ?? count }));
                      edit(i.key, (x) => ({ ...x, piece: { grams: 0 } }));
                      return;
                    }
                    const c = heldCount[i.key] ?? count;
                    setHeldCount(({ [i.key]: _gone, ...rest }) => rest);
                    edit(i.key, (x) => ({
                      ...x,
                      piece: { grams: v },
                      grams: Math.round(c * v * 10) / 10,
                    }));
                  }}
                />
                <p className={styles.meta}>{t.pieceHint(formatGrams(i.grams))}</p>
                <NumberField
                  label={t.portionKcal}
                  ariaLabel={`${t.portionKcal}: ${i.name}`}
                  suffix="ккал"
                  value={Math.round(n.kcal * 10) / 10}
                  emptyAs={0}
                  onChange={(v) => edit(i.key, (x) => withPortionKcal(x, v ?? 0))}
                />
              </>
            )}
            {mode === 'portion' && (
              <>
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
                    label={ru.portion.grams}
                    ariaLabel={`${ru.portion.grams}: ${i.name}`}
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
                <NumberField
                  label={t.portionKcal}
                  ariaLabel={`${t.portionKcal}: ${i.name}`}
                  suffix="ккал"
                  value={Math.round(n.kcal * 10) / 10}
                  emptyAs={0}
                  onChange={(v) => edit(i.key, (x) => withPortionKcal(x, v ?? 0))}
                />
              </>
            )}
            {mode === 'per100' && (
              <div className={styles.per100}>
                {(['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => (
                  <NumberField
                    key={k}
                    label={t.per100[k]}
                    ariaLabel={t.per100Aria(t.per100[k], i.name)}
                    value={i.per100g[k]}
                    emptyAs={0}
                    onChange={(v) => edit(i.key, (x) => withPer100(x, { [k]: v ?? 0 }))}
                  />
                ))}
              </div>
            )}
            {isDrink(i.name) && (
              <div className={styles.drink}>
                <p className={styles.meta}>{t.drinkAsk}</p>
                <Chips
                  label={t.drinkAsk}
                  value={null}
                  onChange={(v: 'none' | Addition) => void addToDrink(i.key, v)}
                  options={[
                    { value: 'none', label: t.noSugar },
                    { value: 'sugar1', label: t.sugar1 },
                    { value: 'sugar2', label: t.sugar2 },
                    { value: 'milk', label: t.milk },
                  ]}
                />
              </div>
            )}
            <p className={styles.macros}>
              <b>{formatKcal(n.kcal)} ккал</b> · Б {formatGrams(n.protein)} · Ж {formatGrams(n.fat)}{' '}
              · У {formatGrams(n.carbs)}
            </p>
            {i.alt && (
              <Button
                variant="text"
                onClick={() =>
                  setItems((list) => list.map((x) => (x.key === i.key ? swapAlt(x) : x)))
                }
              >
                {i.alt.source === 'ai' || i.alt.source === 'web'
                  ? ru.ai.useAi
                  : ru.ai.useCatalog(i.alt.name)}
              </Button>
            )}
            <div className={styles.itemActions}>
              <Button variant="text" onClick={() => setReplacing(i.key)}>
                {t.replace}
              </Button>
              <Button variant="text" onClick={() => setItems(items.filter((x) => x.key !== i.key))}>
                {t.remove}
              </Button>
            </div>
          </div>
        );
      })}
      {canClarify && (
        <Card title={t.clarifyTitle}>
          <p className={styles.notes}>{t.clarifyHint}</p>
          <TextField
            label={t.clarifyLabel}
            placeholder={t.clarifyPlaceholder}
            value={note}
            onChange={setNote}
          />
          {clarifyError && <Notice>{clarifyError}</Notice>}
          <Button
            variant="secondary"
            block
            onClick={() => void clarify()}
            disabled={clarifying || note.trim().length < 3}
            hint={clarifying ? undefined : t.clarifyNeed}
          >
            {clarifying ? t.clarifyBusy : t.clarifyGo}
          </Button>
        </Card>
      )}
      <Card>
        <p className={styles.total}>
          {t.total}: <b>{formatKcal(totals.kcal)} ккал</b>
          <span className={styles.totalMacros}>
            Б {formatGrams(totals.protein)} · Ж {formatGrams(totals.fat)} · У{' '}
            {formatGrams(totals.carbs)}
          </span>
        </p>
        <div className={styles.dateRow}>
          <DateField label={ru.today.date} value={date} onChange={setD} />
          <TimeField label={ru.today.time} value={time} onChange={setTime} />
        </div>
        {notes && <p className={styles.notes}>{notes}</p>}
        {fixedNow.length > 0 && (
          <Switch
            label={t.remember}
            hint={t.rememberHint}
            checked={remember}
            onChange={setRemember}
          />
        )}
      </Card>
      <div className={styles.actions}>
        <Button onClick={() => void save()} disabled={!valid} hint={ru.hints.review}>
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
        <Button variant="text" onClick={cancel}>
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

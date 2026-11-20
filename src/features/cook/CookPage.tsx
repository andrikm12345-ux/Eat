import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { EQUIPMENT, mealForTime, parsePantry, pantryText, type Equipment } from '../../domain/cook';
import { dayTotals } from '../../domain/day';
import { formatGrams, formatKcal } from '../../domain/format';
import { exerciseBonus } from '../../domain/met';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import {
  readFridge,
  suggestDishes,
  toBuy,
  type CookDish,
  type MealKind,
} from '../../services/cook';
import { recordCookSearch } from '../../services/cookHistory';
import { COOK_FORM_SETTING, DEFAULT_COOK_FORM, useCook, type CookForm } from '../../state/cook';
import { toast } from '../../state/ui';
import { IconClock, IconClose } from '../../ui/icons';
import { Button, Card, Chips, Notice, Segmented, Switch, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { PhotoSource } from '../../ui/PhotoSource';
import addStyles from '../add/add.module.css';
import { useAddTarget } from '../add/addTarget';
import { AiGate } from '../ai/AiGate';
import { toImageBlocks } from '../ai/images';
import { useDay } from '../today/useDay';
import styles from './cook.module.css';

const t = ru.cook;

const TIME_OPTIONS = [
  { value: 't15', label: t.times.t15, minutes: 15 },
  { value: 't30', label: t.times.t30, minutes: 30 },
  { value: 't60', label: t.times.t60, minutes: 60 },
  { value: 'any', label: t.times.any, minutes: null },
] as const;
type TimeKey = (typeof TIME_OPTIONS)[number]['value'];
const timeKey = (m: number | null): TimeKey =>
  TIME_OPTIONS.find((o) => o.minutes === m)?.value ?? 'any';

const MEALS: MealKind[] = ['any', 'breakfast', 'lunch', 'dinner', 'snack'];

/** One decimal at most: "12,5". */
const g1 = (v: number) => formatGrams(Math.round(v * 10) / 10);

/** What is left of the day the food goes to (null without a goal). */
function useLeft(date: string) {
  const day = useDay(date);
  return useMemo(() => {
    if (!day?.goal) return null;
    const bonus = exerciseBonus(
      day.mode,
      day.workouts.reduce((s, w) => s + (w.kcal ?? 0), 0),
    );
    const eaten = dayTotals(day.entries);
    return {
      kcal: Math.max(0, day.goal.kcal + bonus - eaten.kcal),
      protein: Math.max(0, day.goal.protein - eaten.protein),
    };
  }, [day]);
}

export function DishCard({
  dish,
  left,
  onOpen,
}: {
  dish: CookDish;
  left: { kcal: number } | null;
  onOpen: () => void;
}) {
  const n = dish.perServing;
  const buy = toBuy(dish);
  const over = left && left.kcal >= 150 ? n.kcal - left.kcal : null;
  return (
    <li>
      <button type="button" className={styles.dish} onClick={onOpen}>
        <span className={styles.dishName}>{dish.idea.name}</span>
        <span className={styles.meta}>
          <IconClock width={16} height={16} />
          {t.minutes(dish.idea.minutes)} · {t.difficulty[dish.idea.difficulty]}
          {dish.idea.equipment?.length
            ? ` · ${dish.idea.equipment.map((e) => t.equip[e].toLowerCase()).join(', ')}`
            : ''}
        </span>
        <span className={styles.nutr}>
          {t.nutrition(formatKcal(n.kcal), g1(n.protein), g1(n.fat), g1(n.carbs))}{' '}
          <span className={styles.muted}>{t.perServing}</span>
        </span>
        <span className={styles.badges}>
          {buy.length === 0 ? (
            <span className={`${styles.badge} ${styles.ok}`}>{t.haveAll}</span>
          ) : (
            <>
              {dish.missing.length > 0 && (
                <span className={`${styles.badge} ${styles.warn}`}>
                  {t.toBuy(dish.missing.join(', '))}
                </span>
              )}
              {dish.short.length > 0 && (
                <span className={`${styles.badge} ${styles.warn}`}>
                  {t.notEnough(dish.short.join(', '))}
                </span>
              )}
            </>
          )}
          {over !== null &&
            (over > 20 ? (
              <span className={`${styles.badge} ${styles.over}`}>{t.over(formatKcal(over))}</span>
            ) : (
              <span className={`${styles.badge} ${styles.fit}`}>{t.fits}</span>
            ))}
        </span>
      </button>
    </li>
  );
}

function CookInner() {
  const target = useAddTarget();
  const navigate = useNavigate();
  const left = useLeft(target.date);
  const result = useCook((s) => s.result);
  const setResult = useCook((s) => s.setResult);
  const openDish = useCook((s) => s.openDish);
  const [form, setForm] = useState<CookForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The form is remembered between visits ("Мой холодильник").
  useEffect(() => {
    let alive = true;
    void repos.settings.get<CookForm>(COOK_FORM_SETTING, DEFAULT_COOK_FORM).then((f) => {
      // The meal follows the time of day each time the screen opens (a change by hand stays).
      if (alive) setForm({ ...DEFAULT_COOK_FORM, ...f, meal: mealForTime(target.time) });
    });
    return () => {
      alive = false;
    };
  }, [target.time]);
  useEffect(() => {
    if (!form) return;
    const id = setTimeout(() => void repos.settings.set(COOK_FORM_SETTING, form), 400);
    return () => clearTimeout(id);
  }, [form]);

  const pantry = useMemo(() => parsePantry(form?.text ?? ''), [form?.text]);
  if (!form) return null;
  const patch = (p: Partial<CookForm>) => setForm({ ...form, ...p });

  async function addPhoto(file: File) {
    setPhotoBusy(true);
    setError(null);
    try {
      const items = await readFridge(repos, await toImageBlocks([file]));
      if (!items.length) {
        toast({ text: t.photoNone, durationMs: 6000 });
        return;
      }
      const have = parsePantry(form?.text ?? '');
      const added = parsePantry(
        items
          .map((i) =>
            i.grams ? `${i.name} ${i.grams} г` : i.count ? `${i.name} ${i.count} шт` : i.name,
          )
          .join(', '),
      );
      setForm((f) => (f ? { ...f, text: pantryText([...have, ...added]) } : f));
      toast({ text: t.photoAdded(added.length), durationMs: 6000 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function go() {
    if (!form || pantry.length === 0) return;
    setBusy(true);
    setError(null);
    // The old list must not stay under a new search (or under its error).
    setResult(null);
    try {
      const res = await suggestDishes(repos, {
        pantry,
        basics: form.basics,
        noBuy: form.noBuy,
        maxMinutes: form.maxMinutes,
        servings: form.servings,
        equipment: form.equipment,
        meal: form.meal,
        wishes: form.wishes,
        left,
      });
      // Remembered for the history (and the administrator): a failure here never hides the result.
      const searchId = await recordCookSearch(repos, form, res).catch(() => undefined);
      setResult({
        ...res,
        pantry,
        servings: form.servings,
        basics: form.basics,
        ...(searchId ? { searchId } : {}),
      });
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title={t.pantryLabel} tone="mint">
        <textarea
          id="cook-pantry"
          aria-label={t.pantryLabel}
          className={`${addStyles.input} ${styles.pantry}`}
          placeholder={t.pantryPlaceholder}
          value={form.text}
          onChange={(e) => patch({ text: e.target.value })}
        />
        {pantry.length > 0 && (
          <ul className={styles.chips} aria-label={t.pantryParsed}>
            {pantry.map((p, i) => (
              <li key={`${p.name}-${i}`} className={styles.chip}>
                <span>
                  {p.name}
                  {p.grams !== null
                    ? ` · ${formatGrams(p.grams)} г`
                    : p.count !== null
                      ? ` · ${t.pieces(String(p.count))}`
                      : ''}
                </span>
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={t.removeItem(p.name)}
                  onClick={() => patch({ text: pantryText(pantry.filter((_, j) => j !== i)) })}
                >
                  <IconClose width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint}>{t.pantryHint}</p>
        <PhotoSource
          label={t.photo}
          busy={photoBusy ? t.photoBusy : null}
          testId="cook-photo"
          onFiles={(f) => f[0] && void addPhoto(f[0])}
        />
      </Card>

      <Card title={t.conditions} tone="sun">
        <Switch
          label={t.basics}
          hint={t.basicsHint}
          checked={form.basics}
          onChange={(v) => patch({ basics: v })}
        />
        <Switch
          label={t.noBuy}
          hint={t.noBuyHint}
          checked={form.noBuy}
          onChange={(v) => patch({ noBuy: v })}
        />
        <p className={styles.label}>{t.equipment}</p>
        <div className={styles.gear} role="group" aria-label={t.equipment}>
          {EQUIPMENT.map((e: Equipment) => {
            const on = form.equipment.includes(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={on}
                className={`${styles.gearBtn} ${on ? styles.gearOn : ''}`}
                onClick={() =>
                  patch({
                    equipment: on ? form.equipment.filter((x) => x !== e) : [...form.equipment, e],
                  })
                }
              >
                {t.equip[e]}
              </button>
            );
          })}
        </div>
        <p className={styles.hint}>{t.equipmentHint}</p>
        <p className={styles.label}>{t.time}</p>
        <Segmented
          label={t.time}
          value={timeKey(form.maxMinutes)}
          options={TIME_OPTIONS}
          onChange={(v) =>
            patch({ maxMinutes: TIME_OPTIONS.find((o) => o.value === v)?.minutes ?? null })
          }
        />
        <p className={styles.label}>{t.meal}</p>
        <Chips
          label={t.meal}
          value={form.meal}
          options={MEALS.map((m) => ({ value: m, label: t.meals[m] }))}
          onChange={(v) => patch({ meal: v })}
        />
        <p className={styles.label}>{t.servings}</p>
        <Segmented
          label={t.servings}
          value={String(form.servings) as '1' | '2' | '3' | '4'}
          options={(['1', '2', '3', '4'] as const).map((v) => ({ value: v, label: v }))}
          onChange={(v) => patch({ servings: Number(v) })}
        />
        <TextField
          label={t.wishes}
          placeholder={t.wishesPlaceholder}
          value={form.wishes}
          onChange={(v) => patch({ wishes: v })}
        />
      </Card>

      {left && left.kcal >= 150 && (
        <p className={styles.hint}>
          {t.left(formatKcal(left.kcal), formatGrams(Math.round(left.protein)))}
        </p>
      )}
      {error && <Notice>{ru.ai.error(error)}</Notice>}
      <Button block onClick={() => void go()} disabled={busy || pantry.length === 0}>
        {busy ? t.working : t.go}
      </Button>
      {pantry.length === 0 && <p className={styles.hint}>{t.needPantry}</p>}

      <div ref={resultsRef}>
        {result && !busy && (
          <section aria-label={t.resultsTitle} className={styles.results}>
            <h2 className={styles.resultsTitle}>{t.resultsTitle}</h2>
            {result.dishes.length === 0 ? (
              <Notice>{t.nothing}</Notice>
            ) : (
              <>
                <ul className={styles.list}>
                  {result.dishes.map((d) => (
                    <DishCard
                      key={d.idea.name}
                      dish={d}
                      left={left}
                      onOpen={() => {
                        openDish(d);
                        navigate(`/cook/dish${target.qs}`);
                      }}
                    />
                  ))}
                </ul>
                <p className={styles.hint}>{t.resultsHint}</p>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}

export default function CookPage() {
  return (
    <Page title={t.title}>
      <AiGate manualTo="/recipes">
        <CookInner />
      </AiGate>
    </Page>
  );
}

import { useState } from 'react';
import { formatGrams, formatKcal } from '../../domain/format';
import { atwaterKcal, isKcalInconsistent, scaleNutrients } from '../../domain/nutrients';
import type { Food, Nutrients, Serving } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { isValidEan } from '../../domain/ean';
import { Button, Card, Chips, Notice, NumberField, Row, TextField } from '../../ui/kit';
import styles from './foodForm.module.css';

const t = ru.foods;

export type FoodDraft = {
  name: string;
  brand?: string | undefined;
  barcode?: string | undefined;
  per100g: Partial<Nutrients>;
  servings: Serving[];
};

const OPTIONAL = ['fiber', 'sugar', 'satFat', 'salt'] as const;

/** Food editor. Returns a complete per-100 g record (kcal from Atwater when empty). */
export function FoodForm({
  initial,
  onSave,
  saveLabel = t.save,
  extraActions,
  logger,
}: {
  initial: FoodDraft;
  onSave: (
    d: Pick<Food, 'name' | 'per100g' | 'servings'> & { brand?: string; barcode?: string },
  ) => void | Promise<void>;
  saveLabel?: string;
  extraActions?: React.ReactNode;
  /**
   * Adds a "how much did you eat" block: the portion is recalculated from the per-100 g values
   * as the grams change, and one button saves the food and logs it.
   */
  logger?: {
    onLog: (
      d: Pick<Food, 'name' | 'per100g' | 'servings'> & { brand?: string; barcode?: string },
      grams: number,
    ) => void | Promise<void>;
  };
}) {
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [barcode, setBarcode] = useState(initial.barcode ?? '');
  const [n, setN] = useState<Partial<Record<string, number | null>>>({ ...initial.per100g });
  const [servings, setServings] = useState<{ label: string; grams: number | null }[]>(
    initial.servings,
  );
  const [grams, setGrams] = useState<number | null>(100);
  const val = (k: string) => (typeof n[k] === 'number' ? (n[k] as number) : null);
  const set = (k: string) => (v: number | null) => setN((p) => ({ ...p, [k]: v }));

  const macros = { protein: val('protein') ?? 0, fat: val('fat') ?? 0, carbs: val('carbs') ?? 0 };
  const kcal = val('kcal') ?? atwaterKcal(macros);
  const per100g: Nutrients = { ...macros, kcal };
  for (const [k, v] of Object.entries(n)) {
    if (typeof v === 'number' && !(k in per100g)) per100g[k] = v;
  }
  const inconsistent = val('kcal') !== null && isKcalInconsistent(per100g);
  const validServings = servings.filter(
    (s) => s.label.trim() && s.grams && s.grams > 0,
  ) as Serving[];
  const nameOk = name.trim().length > 0;
  const kcalOk = kcal >= 0 && kcal <= 900;
  const macrosOk = macros.protein + macros.fat + macros.carbs <= 100.5;
  const valid = nameOk && kcalOk && macrosOk;
  /** What is missing, said under the disabled save button. */
  const problem = !nameOk ? t.needName : !kcalOk ? t.kcalRange : !macrosOk ? t.macrosRange : null;
  const portion = scaleNutrients(per100g, grams ?? 0);
  const gramsOk = grams !== null && grams > 0 && grams < 5000;
  const code = barcode.trim();
  const record = () => ({
    name: name.trim(),
    per100g,
    servings: validServings,
    ...(brand.trim() ? { brand: brand.trim() } : {}),
    ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
  });
  const codeSuspicious = [8, 12, 13].includes(code.length) && !isValidEan(code);

  return (
    <>
      <Card>
        <TextField label={t.name} value={name} onChange={setName} autoFocus={!initial.name} />
        <TextField label={t.brand} value={brand} onChange={setBrand} />
        <TextField
          label={t.barcode}
          value={barcode}
          onChange={setBarcode}
          inputMode="numeric"
          {...(codeSuspicious ? { hint: t.barcodeCheck } : {})}
        />
      </Card>
      <Card title={t.per100}>
        <NumberField
          label={t.kcal}
          suffix={ru.units.kcal}
          value={val('kcal')}
          onChange={set('kcal')}
          hint={val('kcal') === null ? t.kcalFromMacros : undefined}
        />
        <Row>
          <NumberField
            label={t.protein}
            suffix="г"
            value={val('protein')}
            onChange={set('protein')}
          />
          <NumberField label={t.fat} suffix="г" value={val('fat')} onChange={set('fat')} />
          <NumberField label={t.carbs} suffix="г" value={val('carbs')} onChange={set('carbs')} />
        </Row>
        {inconsistent && <Notice>{t.inconsistent(formatKcal(atwaterKcal(macros)))}</Notice>}
        <Row>
          {OPTIONAL.slice(0, 2).map((k) => (
            <NumberField key={k} label={t[k]} suffix="г" value={val(k)} onChange={set(k)} />
          ))}
        </Row>
        <Row>
          {OPTIONAL.slice(2).map((k) => (
            <NumberField key={k} label={t[k]} suffix="г" value={val(k)} onChange={set(k)} />
          ))}
        </Row>
      </Card>
      <Card title={t.servings}>
        {servings.map((s, i) => (
          <Row key={i}>
            <TextField
              label={t.servingLabel}
              value={s.label}
              onChange={(v) =>
                setServings(servings.map((x, j) => (j === i ? { ...x, label: v } : x)))
              }
            />
            <NumberField
              label={t.servingGrams}
              suffix="г"
              value={s.grams}
              onChange={(v) =>
                setServings(servings.map((x, j) => (j === i ? { ...x, grams: v } : x)))
              }
            />
          </Row>
        ))}
        <div className={styles.servingActions}>
          <Button
            variant="text"
            onClick={() => setServings([...servings, { label: '', grams: null }])}
          >
            {t.addServing}
          </Button>
          {servings.length > 0 && (
            <Button variant="text" onClick={() => setServings(servings.slice(0, -1))}>
              {t.removeServing}
            </Button>
          )}
        </div>
      </Card>
      {logger && (
        <Card title={t.eatenTitle}>
          <NumberField label={t.eatenGrams} suffix={ru.units.g} value={grams} onChange={setGrams} />
          {validServings.length > 0 && (
            <Chips
              label={t.servings}
              value={grams}
              onChange={setGrams}
              options={validServings.map((s) => ({
                value: s.grams,
                label: `${s.label} · ${formatGrams(s.grams)}\u00A0${ru.units.g}`,
              }))}
            />
          )}
          <div className={styles.portion} aria-live="polite">
            <div className={styles.portionKcal}>
              {formatKcal(portion.kcal)}
              <small>{ru.units.kcal}</small>
            </div>
            <div className={styles.portionMacros}>
              {(
                [
                  [t.protein, portion.protein],
                  [t.fat, portion.fat],
                  [t.carbs, portion.carbs],
                ] as const
              ).map(([label, v]) => (
                <div key={label}>
                  <b>{`${formatGrams(v)}\u00A0${ru.units.g}`}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      <div className={styles.actions}>
        {logger && (
          <Button
            block
            disabled={!valid || !gramsOk}
            hint={problem ?? (gramsOk ? null : t.needGrams)}
            onClick={() => void logger.onLog(record(), Math.round((grams ?? 0) * 10) / 10)}
          >
            {t.addToDiary}
          </Button>
        )}
        <Button
          block
          variant={logger ? 'secondary' : 'primary'}
          disabled={!valid}
          hint={logger ? null : problem}
          onClick={() => void onSave(record())}
        >
          {logger ? t.onlySave : saveLabel}
        </Button>
        {extraActions}
      </div>
    </>
  );
}

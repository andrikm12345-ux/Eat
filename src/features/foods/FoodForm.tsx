import { useState } from 'react';
import { formatKcal } from '../../domain/format';
import { atwaterKcal, isKcalInconsistent } from '../../domain/nutrients';
import type { Food, Nutrients, Serving } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { Button, Card, Notice, NumberField, Row, TextField } from '../../ui/kit';

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
}: {
  initial: FoodDraft;
  onSave: (
    d: Pick<Food, 'name' | 'per100g' | 'servings'> & { brand?: string; barcode?: string },
  ) => void | Promise<void>;
  saveLabel?: string;
  extraActions?: React.ReactNode;
}) {
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [barcode, setBarcode] = useState(initial.barcode ?? '');
  const [n, setN] = useState<Partial<Record<string, number | null>>>({ ...initial.per100g });
  const [servings, setServings] = useState<{ label: string; grams: number | null }[]>(
    initial.servings,
  );
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
  const valid =
    name.trim().length > 0 &&
    kcal >= 0 &&
    kcal <= 900 &&
    macros.protein + macros.fat + macros.carbs <= 100.5;

  return (
    <>
      <Card>
        <TextField label={t.name} value={name} onChange={setName} autoFocus={!initial.name} />
        <TextField label={t.brand} value={brand} onChange={setBrand} />
        <TextField label={t.barcode} value={barcode} onChange={setBarcode} inputMode="numeric" />
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
        <Row>
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
        </Row>
      </Card>
      <Row>
        {extraActions}
        <Button
          disabled={!valid}
          onClick={() =>
            void onSave({
              name: name.trim(),
              per100g,
              servings: validServings,
              ...(brand.trim() ? { brand: brand.trim() } : {}),
              ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
            })
          }
        >
          {saveLabel}
        </Button>
      </Row>
    </>
  );
}

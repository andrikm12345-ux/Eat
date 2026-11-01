import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { formatGrams, formatKcal } from '../../domain/format';
import { recipePer100g, servingGrams } from '../../domain/recipe';
import type { Food, Recipe } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { compressImage } from '../../services/images';
import { mealToIngredients } from '../../services/aiFood';
import { PROMPT_MEAL } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validateMeal } from '../../ai/validators';
import { toast } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Card, NumberField, Row, Stat, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { FoodSearch } from '../add/SearchPage';
import styles from '../add/add.module.css';

const t = ru.recipes;

export default function RecipeEditPage() {
  const { id } = useParams();
  const recipe = useLiveQuery(
    async () => (id ? ((await repos.recipes.get(id)) ?? null) : null),
    [id],
  );
  if (id && recipe === undefined) return <Page title={t.edit}>{ru.common.loading}</Page>;
  return <Editor key={recipe?.id ?? 'new'} recipe={recipe ?? null} />;
}

type Ing = { foodId: string; grams: number | null };
type Step = { text: string; photoBlobId?: string };

async function savePhoto(file: File, kind: 'recipe' | 'step') {
  const blob = await compressImage(file, 1280, 0.82);
  return (await repos.blobs.create({ blob, mime: 'image/jpeg', kind })).id;
}

function Editor({ recipe }: { recipe: Recipe | null }) {
  const navigate = useNavigate();
  const [name, setName] = useState(recipe?.name ?? '');
  const [ings, setIngs] = useState<Ing[]>(recipe?.ingredients ?? []);
  const [steps, setSteps] = useState<Step[]>(recipe?.steps ?? []);
  const [cooked, setCooked] = useState<number | null>(recipe?.cookedWeightG ?? null);
  const [servings, setServings] = useState<number | null>(recipe?.servingsCount ?? 1);
  const [photo, setPhoto] = useState<string | undefined>(recipe?.photoBlobId);
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function importAi() {
    setImportBusy(true);
    setImportError(null);
    try {
      const { value } = await runAi(repos, {
        kind: 'text',
        vision: false,
        system: PROMPT_MEAL,
        content: [
          { type: 'text', text: `Это список ингредиентов рецепта (на всё блюдо):\n${importText}` },
        ],
        validate: validateMeal,
      });
      const added = await mealToIngredients(repos, value);
      setIngs((list) => [...list, ...added]);
      setImporting(false);
      setImportText('');
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  }
  const foods = useLiveQuery(async () => {
    const list = await repos.db.foods.bulkGet(ings.map((i) => i.foodId));
    return new Map(list.filter((f): f is Food => !!f).map((f) => [f.id, f]));
  }, [ings.map((i) => i.foodId).join()]);

  const resolved = ings.map((i) => ({
    grams: i.grams ?? 0,
    per100g: foods?.get(i.foodId)?.per100g ?? { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  }));
  const per100g = recipePer100g(resolved, cooked);
  const serving = servingGrams(resolved, cooked, servings ?? 1);
  const valid = name.trim() && ings.length > 0 && ings.every((i) => i.grams && i.grams > 0);

  async function save() {
    if (!valid) return;
    const data = {
      name: name.trim(),
      ingredients: ings.map((i) => ({ foodId: i.foodId, grams: i.grams as number })),
      steps: steps.filter((s) => s.text.trim() || s.photoBlobId),
      servingsCount: servings && servings > 0 ? servings : 1,
      per100g,
      ...(cooked ? { cookedWeightG: cooked } : {}),
      ...(photo ? { photoBlobId: photo } : {}),
    };
    if (recipe)
      await repos.recipes.update(recipe.id, {
        ...data,
        cookedWeightG: cooked ?? undefined,
        photoBlobId: photo,
      });
    else await repos.recipes.create(data);
    toast({ text: t.saved });
    navigate(-1);
  }

  return (
    <Page title={recipe ? t.edit : t.new}>
      <Card>
        <TextField label={t.name} value={name} onChange={setName} autoFocus={!recipe} />
        <PhotoInput
          label={photo ? t.photo : t.addPhoto}
          blobId={photo}
          onFile={async (f) => setPhoto(await savePhoto(f, 'recipe'))}
        />
      </Card>
      <Card title={t.ingredients}>
        {ings.map((i, idx) => {
          const f = foods?.get(i.foodId);
          return (
            <Row key={`${i.foodId}-${idx}`}>
              <NumberField
                label={f?.name ?? t.missingFood}
                suffix="г"
                value={i.grams}
                onChange={(v) => setIngs(ings.map((x, j) => (j === idx ? { ...x, grams: v } : x)))}
              />
              <Button
                variant="ghost"
                onClick={() => setIngs(ings.filter((_, j) => j !== idx))}
                aria-label={`${t.remove}: ${f?.name ?? ''}`}
              >
                ×
              </Button>
            </Row>
          );
        })}
        <Button variant="secondary" block onClick={() => setPicking(true)}>
          {t.addIngredient}
        </Button>
        <Button variant="ghost" block onClick={() => setImporting(true)}>
          {t.importAi}
        </Button>
      </Card>
      <Card>
        <NumberField
          label={t.cookedWeight}
          suffix="г"
          value={cooked}
          onChange={setCooked}
          hint={t.cookedHint}
        />
        <NumberField label={t.servings} value={servings} onChange={setServings} />
        <p className={styles.muted}>{t.perServing(formatGrams(serving))}</p>
        <h3 className={styles.sectionTitle}>{t.per100}</h3>
        <Stat label={ru.foods.kcal} value={`${formatKcal(per100g.kcal)} ккал`} />
        <Stat
          label={`${ru.foods.protein} / ${ru.foods.fat} / ${ru.foods.carbs}`}
          value={`${formatGrams(per100g.protein)} / ${formatGrams(per100g.fat)} / ${formatGrams(per100g.carbs)} г`}
        />
      </Card>
      <Card title={t.steps}>
        {steps.map((s, idx) => (
          <div key={idx}>
            <TextField
              label={t.step(idx + 1)}
              value={s.text}
              onChange={(v) => setSteps(steps.map((x, j) => (j === idx ? { ...x, text: v } : x)))}
            />
            <Row>
              <PhotoInput
                label={t.stepPhoto}
                blobId={s.photoBlobId}
                onFile={async (f) => {
                  const pid = await savePhoto(f, 'step');
                  setSteps((list) =>
                    list.map((x, j) => (j === idx ? { ...x, photoBlobId: pid } : x)),
                  );
                }}
              />
              <Button variant="ghost" onClick={() => setSteps(steps.filter((_, j) => j !== idx))}>
                {t.removeStep}
              </Button>
            </Row>
          </div>
        ))}
        <Button variant="secondary" block onClick={() => setSteps([...steps, { text: '' }])}>
          {t.addStep}
        </Button>
      </Card>
      <Row>
        {recipe && (
          <Button
            variant="secondary"
            onClick={async () => {
              await repos.recipes.softDelete(recipe.id);
              toast({
                text: t.deleted,
                action: { label: ru.common.undo, run: () => repos.recipes.restore(recipe.id) },
              });
              navigate('/recipes', { replace: true });
            }}
          >
            {ru.common.delete}
          </Button>
        )}
        <Button onClick={() => void save()} disabled={!valid}>
          {t.save}
        </Button>
      </Row>
      <BottomSheet open={importing} title={t.importAi} onClose={() => setImporting(false)}>
        <p className={styles.muted}>{t.importHint}</p>
        <textarea
          aria-label={t.importAi}
          className={styles.input}
          style={{ minHeight: 140, padding: 'var(--sp-3)' }}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {importError && <p className={styles.muted}>{ru.ai.error(importError)}</p>}
        <Button
          block
          disabled={importBusy || importText.trim().length < 3}
          onClick={() => void importAi()}
        >
          {importBusy ? ru.ai.working : ru.ai.text.go}
        </Button>
      </BottomSheet>
      <BottomSheet open={picking} title={t.pickIngredient} onClose={() => setPicking(false)}>
        <FoodSearch
          autoFocus={false}
          onPick={(f) => {
            setIngs([...ings, { foodId: f.id, grams: f.lastGrams ?? 100 }]);
            setPicking(false);
          }}
        />
      </BottomSheet>
    </Page>
  );
}

function PhotoInput({
  label,
  blobId,
  onFile,
}: {
  label: string;
  blobId?: string | undefined;
  onFile: (f: File) => void | Promise<void>;
}) {
  const rec = useLiveQuery(
    async () => (blobId ? ((await repos.blobs.get(blobId)) ?? null) : null),
    [blobId],
  );
  const url = useMemo(() => (rec ? URL.createObjectURL(rec.blob) : undefined), [rec]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return (
    <div>
      {url && (
        <img
          src={url}
          alt=""
          style={{
            width: '100%',
            maxHeight: 200,
            objectFit: 'cover',
            borderRadius: 'var(--r-field)',
            marginBottom: 'var(--sp-2)',
          }}
        />
      )}
      <label
        className={styles.input}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginBottom: 'var(--sp-3)',
        }}
      >
        {label}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
      </label>
    </div>
  );
}

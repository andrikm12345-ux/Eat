import {
  PROMPT_COOK_IDEAS,
  PROMPT_COOK_STEPS,
  PROMPT_COOK_VERIFY,
  PROMPT_FRIDGE,
} from '../ai/cookPrompts';
import {
  validateCookIdeas,
  validateCookSteps,
  validateCookVerify,
  validateFridge,
  type CookSteps,
  type FridgeItem,
} from '../ai/cookValidators';
import type { ContentBlock } from '../ai/client';
import { runAi } from '../ai/run';
import {
  amountText,
  dishTotals,
  isBasic,
  pickDishes,
  type CookFilters,
  type DayLeft,
  type DishIdea,
  type DishIngredient,
  type PantryItem,
  type RankedDish,
  type RejectReason,
} from '../domain/cook';
import { recipePer100g } from '../domain/recipe';
import { buildIndex, similarity, type IndexedItem } from '../domain/search';
import { normalizeSearch } from '../domain/text';
import type { Food, LocalDate, LocalTime, Nutrients, Recipe } from '../domain/types';
import type { Repos } from '../db/repos';
import { reviewKey, type ReviewDraft, type ReviewItem } from '../state/review';
import { jobIdFor } from './jobId';

export type MealKind = 'any' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type CookRequest = CookFilters & {
  pantry: PantryItem[];
  meal: MealKind;
  /** Free text: "без свинины", "не острое". */
  wishes: string;
  left: DayLeft;
};

/** An ingredient with the values used for counting: from the catalog where it is sure. */
export type ResolvedIngredient = DishIngredient & {
  foodId?: string;
  /** Where the per-100 g values come from. */
  from: 'catalog' | 'ai';
};

export type CookDish = RankedDish & { resolved: ResolvedIngredient[] };

export type CookResult = {
  dishes: CookDish[];
  rejected: { name: string; reason: RejectReason; missing: string[] }[];
  /** The AI was asked a second time because too few dishes passed the check. */
  retried: boolean;
};

const MEAL_TEXT: Record<MealKind, string> = {
  any: '',
  breakfast: 'завтрак',
  lunch: 'обед',
  dinner: 'ужин',
  snack: 'перекус',
};

const amount = (p: PantryItem) =>
  p.grams !== null ? ` ${Math.round(p.grams)} г` : p.count !== null ? ` ${p.count} шт` : '';

/** The request text: products, what is always there, wishes and what is left of the day. */
export function ideasMessage(req: CookRequest, avoid: readonly string[] = []): string {
  const lines = [`Продукты дома: ${req.pantry.map((p) => p.name + amount(p)).join('; ')}.`];
  lines.push(
    req.basics
      ? 'Всегда есть: соль, чёрный перец, сахар, растительное масло, вода, сухие специи.'
      : 'Соль, масло и специи считать только если они в списке.',
  );
  lines.push(`Порций: ${req.servings}.`);
  if (req.maxMinutes) lines.push(`Время: не больше ${req.maxMinutes} минут.`);
  if (req.meal !== 'any') lines.push(`Приём пищи: ${MEAL_TEXT[req.meal]}.`);
  if (req.noBuy) lines.push('Ничего не докупать: только эти продукты и базовые.');
  if (req.wishes.trim()) lines.push(`Пожелания: ${req.wishes.trim().slice(0, 200)}.`);
  if (req.left && req.left.kcal >= 150)
    lines.push(
      `На сегодня осталось примерно ${Math.round(req.left.kcal)} ккал и ${Math.round(
        req.left.protein,
      )} г белка: порция не должна быть больше.`,
    );
  if (avoid.length) lines.push(`Не предлагай: ${avoid.join('; ')}.`);
  return lines.join('\n');
}

const KCAL_CLOSE = 0.35;
/**
 * Lower than for a described meal: catalog names carry extra words ("Рис круглозёрный (крупа)")
 * and every word of the ingredient must still be found; the calorie check guards the rest.
 */
const COOK_MATCH = 0.6;

/**
 * The catalog values of an ingredient when the name matches a verified product closely and its
 * calories agree with what the AI meant (so "Рис" is not taken as cooked rice when the recipe
 * means dry rice): among close names the one nearest in calories wins.
 */
export function resolveIngredient(
  index: readonly IndexedItem<Food>[],
  ing: DishIngredient,
): ResolvedIngredient {
  let best: { f: Food; diff: number } | null = null;
  for (const ix of index) {
    if (!ix.item.verified) continue;
    if (similarity(ix, ing.name) < COOK_MATCH) continue;
    const diff = Math.abs(ix.item.per100g.kcal - ing.per100g.kcal);
    if (!best || diff < best.diff) best = { f: ix.item, diff };
  }
  const hit = best as { f: Food; diff: number } | null;
  if (hit) {
    const ai = ing.per100g.kcal;
    const close = hit.diff <= 40 || hit.diff <= Math.max(ai, hit.f.per100g.kcal) * KCAL_CLOSE;
    if (close) return { ...ing, per100g: hit.f.per100g, foodId: hit.f.id, from: 'catalog' };
  }
  return { ...ing, from: 'ai' };
}

/** Per one serving. */
export const perServing = (resolved: readonly ResolvedIngredient[]): Nutrients =>
  dishTotals(resolved, 1);

/**
 * A second, short question to the AI: which of these names are made up ("Яйцо в соевом соусе",
 * "Кефир с сахаром")? A proposal that sounds like a dish but is not one cannot be recognised by
 * the app itself. If the question fails, all dishes stay (a missing check must not hide them).
 */
export async function withoutMadeUp(r: Repos, ideas: DishIdea[]): Promise<DishIdea[]> {
  if (ideas.length === 0) return ideas;
  try {
    const { value } = await runAi(r, {
      kind: 'cook',
      vision: false,
      system: PROMPT_COOK_VERIFY,
      content: [{ type: 'text', text: ideas.map((d, i) => `${i + 1}. ${d.name}`).join('\n') }],
      validate: validateCookVerify,
    });
    const fake = new Set(value);
    return ideas.filter((_, i) => !fake.has(i + 1));
  } catch {
    return ideas;
  }
}

/** Asks the AI for dishes, checks them against the pantry and ranks them. */
export async function suggestDishes(r: Repos, req: CookRequest): Promise<CookResult> {
  const index = buildIndex(await r.foods.list());
  const resolvedOf = new Map<DishIdea, ResolvedIngredient[]>();
  const resolve = (idea: DishIdea) => {
    let v = resolvedOf.get(idea);
    if (!v) {
      v = idea.ingredients.map((i) => resolveIngredient(index, i));
      resolvedOf.set(idea, v);
    }
    return v;
  };
  const ask = async (avoid: string[]) => {
    const text = ideasMessage(req, avoid);
    const { value } = await runAi(r, {
      kind: 'cook',
      vision: false,
      system: PROMPT_COOK_IDEAS,
      content: [{ type: 'text', text }],
      validate: validateCookIdeas,
      jobId: jobIdFor(`cook:${text}`),
    });
    return withoutMadeUp(r, value);
  };
  let ideas = await ask([]);
  let picked = pickDishes(ideas, req.pantry, req, req.left, (i) => perServing(resolve(i)));
  let retried = false;
  if (picked.shown.length < 3) {
    retried = true;
    const avoid = [
      ...picked.shown.map((d) => d.idea.name),
      ...picked.rejected.map((x) =>
        x.missing.length ? `${x.name} (нет: ${x.missing.join(', ')})` : x.name,
      ),
    ];
    try {
      const more = await ask(avoid);
      const known = new Set(ideas.map((i) => normalizeSearch(i.name)));
      ideas = [...ideas, ...more.filter((i) => !known.has(normalizeSearch(i.name)))];
      picked = pickDishes(ideas, req.pantry, req, req.left, (i) => perServing(resolve(i)));
    } catch {
      // The first answer is still shown.
    }
  }
  return {
    dishes: picked.shown.map((d) => ({ ...d, resolved: resolve(d.idea) })),
    rejected: picked.rejected,
    retried,
  };
}

/** The steps of one dish for `servings` servings. */
export async function loadSteps(r: Repos, dish: CookDish, servings: number): Promise<CookSteps> {
  const list = dish.resolved
    .map((i) => {
      return `${i.name} — ${amountText(i, servings)}${i.optional ? ', по желанию' : ''}`;
    })
    .join('; ');
  const text = `Блюдо: ${dish.idea.name}. Порций: ${servings}. Время всего: около ${dish.idea.minutes} мин.\nИнгредиенты: ${list}.`;
  const { value } = await runAi(r, {
    kind: 'cook',
    vision: false,
    system: PROMPT_COOK_STEPS,
    content: [{ type: 'text', text }],
    validate: validateCookSteps,
    jobId: jobIdFor(`cook-steps:${text}`),
  });
  return value;
}

/** Products seen on a photo of the fridge (the person checks the list before searching). */
export async function readFridge(r: Repos, images: ContentBlock[]): Promise<FridgeItem[]> {
  const { value } = await runAi(r, {
    kind: 'cook',
    vision: true,
    system: PROMPT_FRIDGE,
    content: [...images, { type: 'text', text: 'Какие продукты на фото?' }],
    validate: validateFridge,
  });
  return value;
}

/** Ingredients that add nothing worth logging (water, salt, a pinch of spice). */
const worthLogging = (i: ResolvedIngredient) => (i.grams * i.per100g.kcal) / 100 >= 1;

/** One serving of the dish on the usual check screen (nothing is saved until "Сохранить"). */
export function dishToDraft(
  dish: CookDish,
  at: { date: LocalDate; time: LocalTime },
  note: string,
): ReviewDraft {
  const items: ReviewItem[] = dish.resolved.filter(worthLogging).map((i) => ({
    key: reviewKey(),
    name: i.name,
    grams: Math.round(i.grams * 10) / 10,
    per100g: i.per100g,
    source: i.from === 'catalog' ? 'catalog' : 'ai',
    confidence: i.from === 'catalog' ? 'high' : 'medium',
    ...(i.foodId ? { foodId: i.foodId } : {}),
    ...(i.pieces && i.pieceGrams ? { piece: { grams: i.pieceGrams } } : {}),
  }));
  return {
    items,
    entrySource: 'ai_text',
    analysis: 'ai',
    date: at.date,
    time: at.time,
    mealLabel: dish.idea.name,
    notes: note,
  };
}

/**
 * Saves the dish to "Мои рецепты" for `servings` servings with its steps. Ingredients not in the
 * catalog become the person's own products (an existing one with the same name is reused).
 */
export async function saveDishAsRecipe(
  r: Repos,
  dish: CookDish,
  servings: number,
  steps: CookSteps,
): Promise<Recipe> {
  const foods = await r.foods.list();
  const own = new Map(
    foods.filter((f) => f.source === 'user').map((f) => [normalizeSearch(f.name), f]),
  );
  const ingredients: Recipe['ingredients'] = [];
  for (const i of dish.resolved) {
    if (i.grams * servings <= 0) continue;
    let foodId = i.foodId;
    if (!foodId) {
      const existing = own.get(normalizeSearch(i.name));
      const f =
        existing ??
        (await r.foods.add({
          name: i.name,
          per100g: i.per100g,
          servings: i.pieceGrams ? [{ label: 'шт', grams: i.pieceGrams }] : [],
          source: 'user',
          verified: false,
        }));
      own.set(normalizeSearch(i.name), f);
      foodId = f.id;
    }
    ingredients.push({ foodId, grams: Math.round(i.grams * servings * 10) / 10 });
  }
  const raw = dish.resolved.map((i) => ({ grams: i.grams * servings, per100g: i.per100g }));
  // Cooking water that is drained (pasta, dumplings) must not dilute the dish: the weight of a
  // ready serving says how much the plate weighs.
  const cookedWeightG = dish.idea.portionGrams ? dish.idea.portionGrams * servings : undefined;
  return r.recipes.create({
    name: dish.idea.name,
    ingredients,
    steps: [
      ...steps.steps.map((s) => ({ text: s.minutes ? `${s.text} (${s.minutes} мин)` : s.text })),
      ...(steps.tip ? [{ text: `Совет: ${steps.tip}` }] : []),
    ],
    servingsCount: servings,
    per100g: recipePer100g(raw, cookedWeightG),
    ...(cookedWeightG ? { cookedWeightG } : {}),
  });
}

/** For the list: everything that is not basic, optional or already at home. */
export const toBuy = (d: CookDish) => [...d.missing, ...d.short];

export { isBasic };

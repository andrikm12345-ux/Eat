import { PROMPT_MEAL } from '../ai/prompts';
import { runAi } from '../ai/run';
import { validateMeal } from '../ai/validators';
import type { Repos } from '../db/repos';
import type { LocalDate, LocalTime } from '../domain/types';
import type { ReviewDraft, ReviewItem } from '../state/review';
import { mealToDraft } from './aiFood';

/** The message sent to the AI: the previous estimate and what the user says is wrong with it. */
export function clarifyMessage(items: ReviewItem[], note: string): string {
  const prev = items.map((i) => ({
    name: i.name,
    grams: i.grams,
    per100g: {
      kcal: i.per100g.kcal,
      protein: i.per100g.protein,
      fat: i.per100g.fat,
      carbs: i.per100g.carbs,
    },
  }));
  return `Это уточнение к прежней оценке. Прежняя оценка: ${JSON.stringify({ items: prev })}\nЗамечание пользователя: ${note.trim()}\nУчти замечание (убери или добавь компоненты, измени граммы и значения на 100 г), остальное оставь как есть. Верни полный обновлённый список по той же схеме.`;
}

/** Asks the AI to redo the estimate with the user's remark. Returns a new review draft. */
export async function clarifyMeal(
  r: Repos,
  items: ReviewItem[],
  note: string,
  at: { date: LocalDate; time: LocalTime },
  entrySource: 'ai_photo' | 'ai_text',
): Promise<ReviewDraft> {
  const { value, runId } = await runAi(r, {
    kind: 'text',
    vision: false,
    system: PROMPT_MEAL,
    content: [{ type: 'text', text: clarifyMessage(items, note) }],
    validate: validateMeal,
  });
  return mealToDraft(r, value, at, { entrySource, aiRunId: runId });
}

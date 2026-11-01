import { PROMPT_MEAL } from '../ai/prompts';
import { runAi } from '../ai/run';
import { validateMeal } from '../ai/validators';
import type { Repos } from '../db/repos';
import type { LocalDate, LocalTime } from '../domain/types';
import type { ReviewDraft } from '../state/review';
import { mealToDraft } from './aiFood';
import { searchWeb, withWebContext } from './webSearch';

/** What the AI is told about a barcode that Open Food Facts does not know. */
export const barcodeQuestion = (code: string) =>
  `Штрихкод ${code}. По справке ниже определи, что это за продукт, и верни его одной позицией: grams — вес упаковки или типичной порции, per100g — калорийность и БЖУ на 100 г из справки. Если по справке нельзя уверенно определить продукт именно с этим штрихкодом, верни confidence "low".`;

/**
 * Second chance for a barcode missing from Open Food Facts: look the code up on the web and
 * let the AI read the product from what was found. Null when nothing reliable was found
 * (no account, no search, nothing found, the AI is not sure, or the AI is unavailable).
 */
export async function identifyBarcodeOnWeb(
  r: Repos,
  code: string,
  at: { date: LocalDate; time: LocalTime },
): Promise<ReviewDraft | null> {
  try {
    const web = await searchWeb(r, `штрихкод ${code}`, fetch, { raw: true });
    if (!web) return null;
    const { value, runId } = await runAi(r, {
      kind: 'text',
      vision: false,
      system: PROMPT_MEAL,
      content: [{ type: 'text', text: withWebContext(barcodeQuestion(code), web) }],
      validate: validateMeal,
    });
    const first = value.items[0];
    if (!first || first.confidence === 'low') return null;
    const draft = await mealToDraft(r, { ...value, items: [first] }, at, {
      entrySource: 'ai_text',
      aiRunId: runId,
    });
    return { ...draft, entrySource: 'barcode', barcode: code, sources: web.sources };
  } catch {
    return null;
  }
}

import { ru } from '../../i18n/ru';
import { toast } from '../../state/ui';
import { useReview, type ReviewDraft } from '../../state/review';

/**
 * The AI's answer came after the quick catalog result was already on screen. It is offered
 * (and announced with a pop-up, the offer itself sits at the top of the screen) only if the
 * person is still looking at that very result.
 */
export function offerAiUpgrade(shown: ReviewDraft, late: ReviewDraft): boolean {
  if (useReview.getState().draft !== shown) return false;
  useReview.getState().setUpgrade(late);
  toast({ text: ru.review.upgradeToast, durationMs: 8000 });
  return true;
}

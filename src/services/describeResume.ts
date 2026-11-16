import type { Repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { useReview } from '../state/review';
import { toast } from '../state/ui';

/**
 * "Описать словами" survives the app being minimised or reloaded: while a description is being
 * worked on it is kept in settings; when the app comes back and the result was not shown yet,
 * the same description is asked again. The AI's reply is kept on the server by the description's
 * id, so this takes a moment, not another minute. The result is announced with a pop-up.
 */
export const PENDING_SETTING = 'pendingDescribe';
/** A forgotten description is not resumed after this long. */
export const PENDING_MS = 15 * 60 * 1000;

export type Pending = { text: string; date: string; time: string; at: number };

/** True while this page is working on a description itself (then nothing is resumed). */
let busy = false;
export const markDescribing = (v: boolean) => {
  busy = v;
};

export const rememberPending = (r: Repos, p: Pending) => r.settings.set(PENDING_SETTING, p);
export const clearPending = (r: Repos) => r.db.settings.delete(PENDING_SETTING);

/** Finishes a description that was left unfinished; returns whether a result was offered. */
export async function resumePending(r: Repos, open: (path: string) => void): Promise<boolean> {
  if (busy) return false;
  const p = await r.settings.get<Pending | null>(PENDING_SETTING, null);
  if (!p) return false;
  if (Date.now() - p.at > PENDING_MS || useReview.getState().draft) {
    await clearPending(r);
    return false;
  }
  busy = true;
  try {
    // Loaded only now: it is a lot of code that the start of the app does not need.
    const { analyzeMealByParts } = await import('./mealParts');
    const draft = await analyzeMealByParts(r, p.text, { date: p.date, time: p.time });
    // Something else was put on the check screen meanwhile: leave it alone.
    if (useReview.getState().draft) return false;
    useReview.getState().setDraft(draft);
    toast({
      text: ru.review.resumed,
      durationMs: 20_000,
      action: { label: ru.review.resumedOpen, run: () => open('/review') },
    });
    return true;
  } catch {
    return false;
  } finally {
    await clearPending(r);
    busy = false;
  }
}

/** On start and whenever the app comes back to the screen. */
export function startDescribeResume(r: Repos, open: (path: string) => void) {
  const run = () => void resumePending(r, open).catch(() => undefined);
  run();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}

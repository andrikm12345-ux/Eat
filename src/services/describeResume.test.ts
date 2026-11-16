import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../db/repos';
import { ru } from '../i18n/ru';
import { useReview } from '../state/review';
import { useToasts } from '../state/ui';
import { jobIdFor } from './jobId';
import {
  clearPending,
  markDescribing,
  PENDING_MS,
  PENDING_SETTING,
  rememberPending,
  resumePending,
} from './describeResume';

const at = { date: '2026-11-16', time: '12:00' };

beforeEach(() => {
  markDescribing(false);
  useToasts.setState({ toasts: [] });
});

describe('job id', () => {
  it('the same text gives the same id, a different text another one', () => {
    expect(jobIdFor('Борщ  и хлеб')).toBe(jobIdFor('  борщ и хлеб '));
    expect(jobIdFor('борщ')).not.toBe(jobIdFor('борщи'));
    expect(jobIdFor('борщ')).toMatch(/^d-[a-z0-9]+-\d+$/);
  });
});

describe('finishing an unfinished description', () => {
  it('finishes it, shows the result and offers to open it', async () => {
    // a description the catalog can answer alone, so no AI is needed
    const food = await repos.foods.add({
      name: 'Банан',
      per100g: { kcal: 89, protein: 1.1, fat: 0.3, carbs: 23 },
      servings: [],
      source: 'base',
      verified: true,
    });
    expect(food.id).toBeTruthy();
    await rememberPending(repos, { text: 'банан 120 г', ...at, at: Date.now() });
    const open = vi.fn();
    expect(await resumePending(repos, open)).toBe(true);
    expect(useReview.getState().draft?.items[0]).toMatchObject({ name: 'Банан', grams: 120 });
    const t = useToasts.getState().toasts[0]!;
    expect(t.text).toBe(ru.review.resumed);
    await t.action!.run();
    expect(open).toHaveBeenCalledWith('/review');
    // done: nothing left to resume
    expect(await repos.settings.get(PENDING_SETTING, null)).toBeNull();
  });

  it('does nothing while the page works on it itself, when it is old, or when a draft is open', async () => {
    await rememberPending(repos, { text: 'банан', ...at, at: Date.now() });
    markDescribing(true);
    expect(await resumePending(repos, vi.fn())).toBe(false);
    markDescribing(false);
    expect(await repos.settings.get(PENDING_SETTING, null)).not.toBeNull();

    await rememberPending(repos, { text: 'банан', ...at, at: Date.now() - PENDING_MS - 1000 });
    expect(await resumePending(repos, vi.fn())).toBe(false);
    expect(await repos.settings.get(PENDING_SETTING, null)).toBeNull();

    await rememberPending(repos, { text: 'банан', ...at, at: Date.now() });
    useReview.setState({ draft: { items: [], entrySource: 'manual', ...at } });
    expect(await resumePending(repos, vi.fn())).toBe(false);
    expect(await repos.settings.get(PENDING_SETTING, null)).toBeNull();
    await clearPending(repos);
  });
});

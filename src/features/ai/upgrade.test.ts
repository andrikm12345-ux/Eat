import { beforeEach, describe, expect, it } from 'vitest';
import { useReview, type ReviewDraft } from '../../state/review';
import { useToasts } from '../../state/ui';
import { offerAiUpgrade } from './upgrade';

const draft = (analysis: 'ai' | 'local'): ReviewDraft => ({
  items: [],
  entrySource: 'manual',
  date: '2026-03-01',
  time: '08:00',
  analysis,
});

beforeEach(() => {
  useReview.getState().setDraft(null);
  useToasts.setState({ toasts: [] });
});

describe('the AI answer that comes late', () => {
  it('is offered with a pop-up while the person is still on that result', () => {
    const quick = draft('local');
    useReview.getState().setDraft(quick);
    expect(offerAiUpgrade(quick, draft('ai'))).toBe(true);
    expect(useReview.getState().upgrade).not.toBeNull();
    expect(useToasts.getState().toasts).toHaveLength(1);
  });

  it('is dropped silently when the person has already left or saved', () => {
    const quick = draft('local');
    useReview.getState().setDraft(quick);
    useReview.getState().setDraft(null);
    expect(offerAiUpgrade(quick, draft('ai'))).toBe(false);
    expect(useReview.getState().upgrade).toBeNull();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});

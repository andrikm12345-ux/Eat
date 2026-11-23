import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEAVE_MS, useLeaving } from './useLeaving';

const e = (id: string, time: string) => ({ id, time });

describe('removed entries leave the list for good', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a removed entry stays for the animation, then goes', () => {
    const { result, rerender } = renderHook(({ items }) => useLeaving(items), {
      initialProps: { items: [e('a', '08:00'), e('b', '09:00')] },
    });
    rerender({ items: [e('a', '08:00')] });
    expect(result.current.list.map((x) => x.id)).toEqual(['a', 'b']);
    expect(result.current.leaving.has('b')).toBe(true);
    act(() => void vi.advanceTimersByTime(LEAVE_MS + 10));
    expect(result.current.list.map((x) => x.id)).toEqual(['a']);
  });

  it('entries removed one after another (a sync) do not leave ghosts behind', () => {
    const all = [e('a', '07:00'), e('b', '08:00'), e('c', '09:00'), e('d', '10:00')];
    const { result, rerender } = renderHook(({ items }) => useLeaving(items), {
      initialProps: { items: all },
    });
    // each change arrives before the previous animation has finished
    rerender({ items: all.slice(0, 3) });
    act(() => void vi.advanceTimersByTime(50));
    rerender({ items: all.slice(0, 2) });
    act(() => void vi.advanceTimersByTime(50));
    rerender({ items: all.slice(0, 1) });
    act(() => void vi.advanceTimersByTime(LEAVE_MS + 10));
    expect(result.current.list.map((x) => x.id)).toEqual(['a']);
    expect(result.current.leaving.size).toBe(0);
  });
});

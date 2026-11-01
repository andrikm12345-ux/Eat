import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollOverToday, startTodayWatcher, useUi } from './ui';

const day = (iso: string) => new Date(`${iso}T09:00:00`);

afterEach(() => vi.useRealTimers());

describe('rollOverToday', () => {
  it('moves the screen from yesterday to the new today, but keeps a day picked on purpose', () => {
    rollOverToday(day('2030-05-01'));
    useUi.getState().setDate('2030-05-01');
    expect(rollOverToday(day('2030-05-01'))).toBe(false);
    expect(rollOverToday(day('2030-05-02'))).toBe(true);
    expect(useUi.getState().date).toBe('2030-05-02');
    // The user looks at an older day, then the date changes again: that choice stays.
    useUi.getState().setDate('2030-04-20');
    expect(rollOverToday(day('2030-05-03'))).toBe(false);
    expect(useUi.getState().date).toBe('2030-04-20');
  });
});

describe('startTodayWatcher', () => {
  it('checks on resume, on focus and every minute, and stops on request', () => {
    vi.useFakeTimers();
    rollOverToday(day('2030-06-01'));
    useUi.getState().setDate('2030-06-01');
    const stop = startTodayWatcher();
    vi.setSystemTime(day('2030-06-02'));
    vi.advanceTimersByTime(60_000);
    expect(useUi.getState().date).toBe('2030-06-02');

    vi.setSystemTime(day('2030-06-03'));
    window.dispatchEvent(new Event('focus'));
    expect(useUi.getState().date).toBe('2030-06-03');

    vi.setSystemTime(day('2030-06-04'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(useUi.getState().date).toBe('2030-06-04');

    stop();
    vi.setSystemTime(day('2030-06-05'));
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(120_000);
    expect(useUi.getState().date).toBe('2030-06-04');
  });
});

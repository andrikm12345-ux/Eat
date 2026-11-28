import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutBroken, startResumeGuard, type Env, type Metrics } from './resumeGuard';

const ok: Metrics = {
  innerW: 414,
  innerH: 896,
  clientW: 414,
  clientH: 896,
  scrollW: 414,
  vv: { offsetLeft: 0, scale: 1 },
  keyboardOpen: false,
};

describe('layoutBroken', () => {
  it('a healthy layout is fine', () => {
    expect(layoutBroken(ok)).toBe(false);
  });
  it('the keyboard shrinking the page is fine', () => {
    expect(layoutBroken({ ...ok, clientH: 450, innerH: 896, keyboardOpen: true })).toBe(false);
  });
  it('sideways shift, zoom, pan and a blank strip are broken', () => {
    expect(layoutBroken({ ...ok, scrollW: 560 })).toBe(true);
    expect(layoutBroken({ ...ok, clientW: 300 })).toBe(true);
    expect(layoutBroken({ ...ok, vv: { offsetLeft: 140, scale: 1 } })).toBe(true);
    expect(layoutBroken({ ...ok, vv: { offsetLeft: 0, scale: 1.4 } })).toBe(true);
    expect(layoutBroken({ ...ok, clientH: 450 })).toBe(true);
  });
  it('small differences are tolerated', () => {
    expect(layoutBroken({ ...ok, scrollW: 416, clientH: 880 })).toBe(false);
  });
});

describe('the guard on resume', () => {
  let metrics: Metrics;
  let reloads = 0;
  let nudges = 0;
  let last = 0;
  let clock = 1_000_000;
  const env = (standalone = true, fixedByNudge = false): Env => ({
    standalone: () => standalone,
    metrics: () => metrics,
    nudge: () => {
      nudges += 1;
      if (fixedByNudge) metrics = ok;
    },
    reload: () => void (reloads += 1),
    now: () => clock,
    lastReload: { get: () => last, set: (t) => void (last = t) },
  });
  const resume = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    metrics = ok;
    reloads = 0;
    nudges = 0;
    last = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('does nothing when the layout is healthy', () => {
    const stop = startResumeGuard(env());
    resume();
    vi.advanceTimersByTime(3000);
    expect(nudges + reloads).toBe(0);
    stop();
  });

  it('does nothing outside the installed app', () => {
    metrics = { ...ok, scrollW: 600 };
    const stop = startResumeGuard(env(false));
    resume();
    vi.advanceTimersByTime(3000);
    expect(nudges + reloads).toBe(0);
    stop();
  });

  it('a nudge that repairs the layout is enough: no reload', () => {
    metrics = { ...ok, scrollW: 600 };
    const stop = startResumeGuard(env(true, true));
    resume();
    vi.advanceTimersByTime(3000);
    expect(nudges).toBe(1);
    expect(reloads).toBe(0);
    stop();
  });

  it('a layout that stays broken is reloaded, but not more than once per 30 seconds', () => {
    metrics = { ...ok, scrollW: 600 };
    const stop = startResumeGuard(env());
    resume();
    vi.advanceTimersByTime(3000);
    expect(reloads).toBe(1);
    clock += 10_000;
    resume();
    vi.advanceTimersByTime(3000);
    expect(reloads).toBe(1);
    clock += 40_000;
    resume();
    vi.advanceTimersByTime(3000);
    expect(reloads).toBe(2);
    stop();
  });
});

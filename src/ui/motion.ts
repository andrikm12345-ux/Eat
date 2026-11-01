import { useEffect, useRef, useState } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animations are skipped in tests and for people who asked for reduced motion. */
export const motionEnabled = () => import.meta.env.MODE !== 'test' && !reducedMotion();

/** false on the first frame, true right after: lets CSS transitions run from an "empty" state. */
export function useAppeared(): boolean {
  const [shown, setShown] = useState(!motionEnabled());
  useEffect(() => {
    if (shown) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);
  return shown;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that glides to its new value instead of jumping. */
export function useCountUp(target: number, ms = 700): number {
  const enabled = motionEnabled();
  const [value, setValue] = useState(enabled ? 0 : target);
  const from = useRef(value);
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const v0 = from.current;
    let id = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = v0 + (target - v0) * easeOut(t);
      from.current = v;
      setValue(v);
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms, enabled]);
  return enabled ? value : target;
}

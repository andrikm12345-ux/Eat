import { useEffect, type RefObject } from 'react';
import { motionEnabled } from './motion';

const DISTANCE = 90;
const SKIP = 'input, textarea, select, [role="dialog"], [role="slider"], [data-no-swipe-back]';

/** True when something under the finger scrolls sideways itself (a chart, a wide table). */
function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX))
      return true;
  }
  return false;
}

/**
 * Swipe right anywhere on the screen to go back. The page follows the finger a little; a
 * mostly horizontal move of more than 90 px counts. Fields, sliders, sheets and sideways
 * scrolling areas keep their own gestures.
 */
export function useSwipeBack(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  back: () => void,
) {
  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) return;
    // The whole screen listens (the page may be shorter than the screen); the main block moves.
    const area = document;
    let sx = 0;
    let sy = 0;
    let live = false;
    let locked = false;
    const follow = (dx: number) => {
      if (!motionEnabled()) return;
      el.style.transition = 'none';
      el.style.transform = dx ? `translateX(${dx * 0.5}px)` : '';
      el.style.opacity = dx ? String(1 - Math.min(dx, 240) / 600) : '';
    };
    const release = () => {
      el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      el.style.transform = '';
      el.style.opacity = '';
    };
    const down = (e: TouchEvent) => {
      live = e.touches.length === 1 && !(e.target as Element).closest?.(SKIP);
      locked = false;
      if (!live) return;
      sx = e.touches[0]!.clientX;
      sy = e.touches[0]!.clientY;
      if (scrollsSideways(e.target as Element, el)) live = false;
    };
    const move = (e: TouchEvent) => {
      if (!live) return;
      const dx = e.touches[0]!.clientX - sx;
      const dy = e.touches[0]!.clientY - sy;
      if (!locked) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) live = false;
        else if (dx > 12 && dx > Math.abs(dy) * 1.5) locked = true;
        else if (dx < -12) live = false;
      }
      if (locked) follow(Math.max(0, dx));
    };
    const up = (e: TouchEvent) => {
      if (!live || !locked) return;
      live = false;
      const dx = e.changedTouches[0]!.clientX - sx;
      release();
      if (dx > DISTANCE) back();
    };
    const cancel = () => {
      if (locked) release();
      live = false;
    };
    area.addEventListener('touchstart', down, { passive: true });
    area.addEventListener('touchmove', move, { passive: true });
    area.addEventListener('touchend', up, { passive: true });
    area.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      area.removeEventListener('touchstart', down);
      area.removeEventListener('touchmove', move);
      area.removeEventListener('touchend', up);
      area.removeEventListener('touchcancel', cancel);
    };
  }, [target, enabled, back]);
}

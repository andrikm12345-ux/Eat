import { useEffect } from 'react';
import { motionEnabled } from './motion';

const DISTANCE = 90;
/** Gestures that belong to the element itself. */
const OWN = '[role="dialog"], [role="slider"], input[type="range"], [data-no-swipe-back]';

/** True when something under the finger scrolls sideways itself (a chart, a wide table). */
function scrollsSideways(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX))
      return true;
  }
  return false;
}

/** A round arrow that comes in from the left edge while the finger moves. */
function makeArrow() {
  const a = document.createElement('div');
  a.setAttribute('aria-hidden', 'true');
  a.textContent = '‹';
  Object.assign(a.style, {
    position: 'fixed',
    left: '0',
    top: '50%',
    zIndex: '80',
    width: '46px',
    height: '46px',
    marginTop: '-23px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    font: '700 30px/1 system-ui, sans-serif',
    paddingBottom: '4px',
    pointerEvents: 'none',
    boxShadow: '0 6px 18px rgba(0,0,0,.25)',
    background: '#30355e',
    color: '#fff',
    opacity: '0',
    transform: 'translateX(-60px)',
  });
  document.body.appendChild(a);
  return a;
}

/**
 * Swipe right anywhere on the screen to go back. A round arrow follows the finger and turns
 * green once the swipe is long enough (90 px, mostly horizontal). Nothing on the page moves.
 * Sliders, open sheets and sideways-scrolling areas keep their own gestures; a text field
 * keeps it only while it has the focus (then a drag selects text).
 */
export function useSwipeBack(enabled: boolean, back: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let sx = 0;
    let sy = 0;
    let live = false;
    let locked = false;
    let arrow: HTMLDivElement | null = null;
    const show = (dx: number) => {
      if (!arrow) arrow = makeArrow();
      const p = Math.min(dx / DISTANCE, 1);
      arrow.style.transition = 'none';
      arrow.style.opacity = String(0.25 + p * 0.75);
      arrow.style.transform = `translateX(${Math.min(dx * 0.5, 56) - 8}px)`;
      const ready = dx > DISTANCE;
      arrow.style.background = ready ? '#b6e98e' : '#30355e';
      arrow.style.color = ready ? '#1d3b2f' : '#fff';
    };
    const hide = () => {
      const a = arrow;
      arrow = null;
      if (!a) return;
      if (!motionEnabled()) return a.remove();
      a.style.transition = 'transform .2s ease, opacity .2s ease';
      a.style.opacity = '0';
      a.style.transform = 'translateX(-60px)';
      window.setTimeout(() => a.remove(), 220);
    };
    const down = (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const field = target?.closest('input, textarea');
      live =
        e.touches.length === 1 &&
        !!target &&
        !target.closest(OWN) &&
        !(field && field === document.activeElement) &&
        !scrollsSideways(target);
      locked = false;
      const t = e.touches[0];
      if (!live || !t) return;
      sx = t.clientX;
      sy = t.clientY;
    };
    const move = (e: TouchEvent) => {
      if (!live) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!locked) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) live = false;
        else if (dx > 12 && dx > Math.abs(dy) * 1.5) locked = true;
        else if (dx < -12) live = false;
      }
      if (locked && motionEnabled()) show(Math.max(0, dx));
    };
    const up = (e: TouchEvent) => {
      const was = live && locked;
      live = false;
      locked = false;
      hide();
      if (!was) return;
      const dx = (e.changedTouches[0]?.clientX ?? sx) - sx;
      if (dx > DISTANCE) back();
    };
    const cancel = () => {
      live = false;
      locked = false;
      hide();
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', cancel);
      hide();
    };
  }, [enabled, back]);
}

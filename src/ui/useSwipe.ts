import { useRef, useState, type PointerEvent } from 'react';

const THRESHOLD = 80;
const LONG_PRESS_MS = 500;

/**
 * Horizontal swipe + long press on a row. Vertical movement cancels both so the
 * page can scroll. Returns pointer handlers, current offset and a click guard.
 */
export function useSwipe(h: {
  onLeft?: () => void;
  onRight?: () => void;
  onLongPress?: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const s = useRef({ x: 0, y: 0, active: false, horizontal: false, fired: false, timer: 0 });

  const clearTimer = () => window.clearTimeout(s.current.timer);

  return {
    dx,
    dragging,
    /** True right after a long press/swipe: the following click must be ignored. */
    consumeClick: () => {
      const f = s.current.fired;
      s.current.fired = false;
      return f;
    },
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        s.current = {
          ...s.current,
          x: e.clientX,
          y: e.clientY,
          active: true,
          horizontal: false,
          fired: false,
        };
        clearTimer();
        if (h.onLongPress) {
          s.current.timer = window.setTimeout(() => {
            s.current.fired = true;
            s.current.active = false;
            h.onLongPress?.();
          }, LONG_PRESS_MS);
        }
      },
      onPointerMove: (e: PointerEvent) => {
        const st = s.current;
        if (!st.active) return;
        const mx = e.clientX - st.x;
        const my = e.clientY - st.y;
        if (!st.horizontal) {
          if (Math.abs(my) > 10) {
            st.active = false;
            clearTimer();
            return;
          }
          if (Math.abs(mx) > 10) {
            st.horizontal = true;
            clearTimer();
            setDragging(true);
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }
        }
        if (st.horizontal) setDx(Math.max(-140, Math.min(140, mx)));
      },
      onPointerUp: () => {
        const st = s.current;
        clearTimer();
        if (st.horizontal) {
          st.fired = true;
          if (dx <= -THRESHOLD) h.onLeft?.();
          else if (dx >= THRESHOLD) h.onRight?.();
        }
        st.active = false;
        st.horizontal = false;
        setDragging(false);
        setDx(0);
      },
      onPointerCancel: () => {
        clearTimer();
        s.current.active = false;
        s.current.horizontal = false;
        setDragging(false);
        setDx(0);
      },
      onContextMenu: (e: { preventDefault: () => void }) => {
        if (!h.onLongPress) return;
        e.preventDefault();
        clearTimer();
        s.current.fired = true;
        h.onLongPress();
      },
    },
  };
}

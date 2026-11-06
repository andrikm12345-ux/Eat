import { useRef, useState } from 'react';

type Start = { x: number; y: number };

/**
 * Horizontal swipe: follows the finger, then moves the date by `step` days.
 * A real swipe swallows the click that would otherwise select a day.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<Start | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const reset = () => {
    start.current = null;
    setDx(0);
  };
  return {
    dx,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const mx = e.clientX - s.x;
        if (Math.abs(mx) > Math.abs(e.clientY - s.y)) setDx(mx);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = start.current;
        reset();
        if (!s) return;
        const mx = e.clientX - s.x;
        if (Math.abs(mx) > 50 && Math.abs(mx) > 1.5 * Math.abs(e.clientY - s.y)) {
          swiped.current = true;
          onSwipe(mx < 0 ? 1 : -1);
        }
      },
      onPointerCancel: reset,
      onClickCapture: (e: React.MouseEvent) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      },
    },
  };
}

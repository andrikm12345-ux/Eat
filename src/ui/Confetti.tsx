import { useEffect } from 'react';
import { useCelebrate } from '../state/celebrate';

const TOKENS = ['--green-600', '--green-300', '--macro-carbs', '--macro-fat', '--kind-strength'];

/** Concrete colours of the current theme (a canvas cannot use var()). */
const palette = () => {
  const css = getComputedStyle(document.documentElement);
  return TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
};

/**
 * Lightweight canvas confetti (no dependency); respects reduced motion. The canvas is created
 * only when the confetti plays and removed right after: an idle full-screen canvas sits at its
 * default 300×150 size, and iOS Safari can paint such a canvas as a black rectangle over the app.
 */
export function Confetti(): null {
  const burst = useCelebrate((s) => s.burst);
  useEffect(() => {
    if (!burst || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = palette();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || colors.length === 0) return;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100dvh',
      pointerEvents: 'none',
      zIndex: '70',
    });
    document.body.appendChild(canvas);
    const parts = Array.from({ length: 90 }, () => ({
      x: w / 2,
      y: h / 3,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -10 - 2,
      s: 4 + Math.random() * 5,
      c: colors[Math.floor(Math.random() * colors.length)] as string,
      r: Math.random() * Math.PI,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (++frame < 110) raf = requestAnimationFrame(tick);
      else canvas.remove();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [burst]);
  return null;
}

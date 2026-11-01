import { useEffect, useRef } from 'react';
import { useCelebrate } from '../state/celebrate';

const TOKENS = ['--green-600', '--green-300', '--macro-carbs', '--macro-fat', '--kind-strength'];

/** Concrete colours of the current theme (a canvas cannot use var()). */
const palette = () => {
  const css = getComputedStyle(document.documentElement);
  return TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
};

/** Lightweight canvas confetti (no dependency); respects reduced motion. */
export function Confetti() {
  const burst = useCelebrate((s) => s.burst);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!burst || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const colors = palette();
    if (colors.length === 0) return;
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
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [burst]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 70 }}
    />
  );
}

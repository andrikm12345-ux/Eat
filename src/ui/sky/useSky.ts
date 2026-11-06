import { useEffect, useState } from 'react';
import { seasonOf, skyAt } from '../../features/today/scene';

/** The clock, refreshed every minute: the sky and the "now" mark follow it. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The sky of this minute and the season of this month. */
export function useSky() {
  const now = useNow();
  const hours = now.getHours() + now.getMinutes() / 60;
  return { now, hours, sky: skyAt(hours), season: seasonOf(now.getMonth()) };
}

/**
 * While a sky is on screen the browser bar and the strip under the notch take its top colour,
 * so the sky seems to go on up to the edge of the phone.
 */
export function useTopColor(color: string) {
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const old = metas.map((m) => m.content);
    for (const m of metas) m.content = color;
    const root = document.documentElement.style;
    root.setProperty('--top-color', color);
    return () => {
      metas.forEach((m, i) => (m.content = old[i] ?? m.content));
      root.removeProperty('--top-color');
    };
  }, [color]);
}

import type { CSSProperties, ReactNode } from 'react';
import { SeasonLayer, Stars } from '../../features/today/SeasonLayer';
import { useSky, useTopColor } from './useSky';
import styles from './sky.module.css';

/**
 * The coloured top of every main tab: a sky that follows the time of day, stars at night,
 * leaves / snow / petals by the season and a strip of "ground" along the bottom edge.
 */
export function SkyHeader({
  children,
  label,
  labelledBy,
  className,
}: {
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  className?: string;
}) {
  const { sky, season } = useSky();
  useTopColor(sky.top);
  const style = {
    '--sky-top': sky.top,
    '--sky-mid': sky.mid,
    '--sky-bottom': sky.bottom,
    '--stars': String(sky.stars),
  } as CSSProperties;
  return (
    <section
      className={[styles.sky, sky.dark ? styles.dark : styles.light, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-label={label}
      aria-labelledby={labelledBy}
      data-sky={sky.dark ? 'dark' : 'light'}
    >
      <Stars />
      <SeasonLayer season={season} night={sky.stars > 0.5} />
      <div className={styles.content}>{children}</div>
      <SeasonLayer season={season} ground />
    </section>
  );
}

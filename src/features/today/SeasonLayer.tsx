import type { CSSProperties } from 'react';
import { motionEnabled } from '../../ui/motion';
import type { Season } from './scene';
import styles from './dayHero.module.css';

/** A fixed pseudo-random sequence: the sky looks the same on every render. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const STARS = (() => {
  const r = seeded(7);
  return Array.from({ length: 42 }, () => ({
    left: r() * 100,
    top: r() * 70,
    size: r() < 0.8 ? 2 : 3,
    delay: r() * 6,
  }));
})();

/** Stars fade in at dusk and out at dawn (their opacity follows --stars). */
export function Stars() {
  return (
    <div className={styles.stars} aria-hidden="true">
      {STARS.map((s, i) => (
        <i
          key={i}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const LEAF = 'M0 -6 C 4 -4 5 2 0 6 C -5 2 -4 -4 0 -6 Z';
const AUTUMN = ['#e8913a', '#d4552f', '#e8b23a', '#c9402b', '#b8652a'];
const SPRING = ['#f7b6c8', '#fbd1dc', '#f39ab4'];

/** Falling leaves / snow / petals, or fireflies on a summer night; plus the "ground" strip. */
export function SeasonLayer({
  season,
  night = false,
  ground = false,
}: {
  season: Season;
  night?: boolean;
  ground?: boolean;
}) {
  if (ground) return <Ground season={season} />;
  if (season === 'summer' && !night) return null;
  const r = seeded(season.length * 31 + 3);
  const count = season === 'summer' ? 8 : 12;
  const moving = motionEnabled();
  return (
    <div className={`${styles.particles} ${moving ? '' : styles.still}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const style = {
          left: `${r() * 100}%`,
          top: moving ? undefined : `${r() * 80}%`,
          animationDuration: `${12 + r() * 10}s`,
          animationDelay: `${-r() * 20}s`,
          '--drift': `${(r() - 0.5) * 120}px`,
          '--spin': `${(r() - 0.5) * 720}deg`,
        } as CSSProperties;
        if (season === 'autumn') {
          const color = AUTUMN[i % AUTUMN.length];
          return (
            <svg
              key={i}
              className={styles.fall}
              style={style}
              viewBox="-7 -7 14 14"
              width={14}
              height={14}
            >
              <path d={LEAF} fill={color} />
            </svg>
          );
        }
        if (season === 'spring') {
          return (
            <svg
              key={i}
              className={styles.fall}
              style={style}
              viewBox="-6 -6 12 12"
              width={10}
              height={10}
            >
              <ellipse rx="5" ry="3" fill={SPRING[i % SPRING.length]} />
            </svg>
          );
        }
        if (season === 'winter') {
          return <i key={i} className={`${styles.fall} ${styles.snow}`} style={style} />;
        }
        return (
          <i key={i} className={styles.firefly} style={{ ...style, top: `${30 + r() * 50}%` }} />
        );
      })}
    </div>
  );
}

/** The strip along the bottom of the card: fallen leaves, a snowdrift or grass. */
function Ground({ season }: { season: Season }) {
  const r = seeded(11);
  if (season === 'winter') {
    return (
      <svg
        className={styles.ground}
        viewBox="0 0 400 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 18 Q 50 6 100 16 T 200 14 T 300 16 T 400 12 V30 H0 Z" fill="#f4f8ff" />
        <path d="M0 24 Q 60 16 120 22 T 240 20 T 400 20 V30 H0 Z" fill="#dfe8f6" />
      </svg>
    );
  }
  if (season === 'autumn') {
    return (
      <svg
        className={styles.ground}
        viewBox="0 0 400 30"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        {Array.from({ length: 110 }, (_, i) => {
          const x = r() * 400;
          const y = 14 + r() * 16;
          return (
            <path
              key={i}
              d={LEAF}
              fill={AUTUMN[i % AUTUMN.length]}
              transform={`translate(${x} ${y}) rotate(${r() * 360}) scale(${0.9 + r() * 0.7})`}
              opacity={0.75 + r() * 0.25}
            />
          );
        })}
      </svg>
    );
  }
  const color = season === 'spring' ? '#7fbf5a' : '#5f9e45';
  return (
    <svg
      className={styles.ground}
      viewBox="0 0 400 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 20 Q 40 12 80 18 T 160 16 T 240 18 T 320 15 T 400 18 V30 H0 Z" fill={color} />
      {season === 'spring' &&
        Array.from({ length: 24 }, (_, i) => (
          <circle
            key={i}
            cx={r() * 400}
            cy={20 + r() * 8}
            r={1.6}
            fill={SPRING[i % SPRING.length]}
          />
        ))}
    </svg>
  );
}

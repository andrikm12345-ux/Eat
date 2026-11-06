import styles from './progress.module.css';

/** A light line of the weight trend drawn right on the sky, with the goal as a dashed line. */
export function Sparkline({
  values,
  target,
  label,
}: {
  values: number[];
  target?: number;
  label: string;
}) {
  if (values.length < 2) return null;
  const W = 300;
  const H = 84;
  const pad = 6;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // The goal line is shown only when it is near enough not to flatten the curve.
  const showTarget = target !== undefined && target > lo - 3 && target < hi + 3;
  if (showTarget) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
  if (hi - lo < 0.6) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.3;
    hi = mid + 0.3;
  }
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const last = values[values.length - 1] as number;
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b6e98e" stopOpacity="0.45" />
          <stop offset="1" stopColor="#b6e98e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {showTarget && (
        <line
          x1="0"
          x2={W}
          y1={y(target)}
          y2={y(target)}
          className={styles.sparkTarget}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline points={line} className={styles.sparkLine} vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={y(last)} r="5" className={styles.sparkDot} />
    </svg>
  );
}

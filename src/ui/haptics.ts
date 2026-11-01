/** A short vibration on important actions. Android only: iPhone has no vibration API, so it is silent there. */
export function buzz(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

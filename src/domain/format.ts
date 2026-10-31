// Number formatting for the UI (Russian locale: decimal comma, thin grouping).

const nf = (digits: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits });

const kcalFmt = nf(0);
const gramsFmt = nf(1);
const kgFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Avoid "-0" in output.
const noNegZero = (v: number) => (Object.is(v, -0) ? 0 : v);

/** Calories: integers. */
export function formatKcal(v: number): string {
  return kcalFmt.format(noNegZero(Math.round(v)));
}

/** Grams: up to 1 decimal. */
export function formatGrams(v: number): string {
  return gramsFmt.format(noNegZero(Math.round(v * 10) / 10));
}

/** Body weight: always 1 decimal. */
export function formatKg(v: number): string {
  return kgFmt.format(noNegZero(Math.round(v * 10) / 10));
}

/** Signed difference for neutral "+180 ккал" style labels. */
export function formatSignedKcal(v: number): string {
  const r = noNegZero(Math.round(v));
  return r > 0 ? `+${kcalFmt.format(r)}` : kcalFmt.format(r).replace('-', '−');
}

/**
 * Parses user input accepting both "," and "." as the decimal separator and
 * ignoring spaces. Returns `null` for anything that is not a finite number.
 */
export function parseDecimal(input: string): number | null {
  const s = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

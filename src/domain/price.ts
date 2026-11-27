/** Price helpers for "Мои продукты": the person types the price of a pack, a kilo or 100 g. */

/** Roubles per 100 g, or null when the price or its weight is missing. */
export function pricePer100g(price?: number, grams?: number): number | null {
  if (!(typeof price === 'number' && price > 0)) return null;
  if (!(typeof grams === 'number' && grams > 0)) return null;
  return (price / grams) * 100;
}

/** Roubles for a portion of `grams` grams. */
export function portionPrice(
  price: number | undefined,
  priceGrams: number | undefined,
  grams: number,
) {
  const per100 = pricePer100g(price, priceGrams);
  return per100 === null ? null : (per100 * grams) / 100;
}

/** "89 ₽" / "12,5 ₽": whole roubles from 100, else one decimal. */
export function formatRub(v: number): string {
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${String(r).replace('.', ',')}\u00A0₽`;
}

/** Shops used before, most frequent first (for suggestions). */
export function knownStores(foods: readonly { store?: string | undefined }[]): string[] {
  const count = new Map<string, number>();
  for (const f of foods) {
    const s = f.store?.trim();
    if (s) count.set(s, (count.get(s) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([s]) => s);
}

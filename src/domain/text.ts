/** Normalizes text for search keys: lower case, ё→е, collapsed whitespace. */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

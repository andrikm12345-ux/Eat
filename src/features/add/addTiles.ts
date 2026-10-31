/** Tiles of the "Добавить" sheet. `path: null` = not available yet. */
export const ADD_TILES = [
  { key: 'search', path: '/add/search' },
  { key: 'barcode', path: '/add/barcode' },
  { key: 'photoAi', path: null },
  { key: 'textAi', path: null },
  { key: 'labelAi', path: null },
  { key: 'quickKcal', path: '/add/quick' },
  { key: 'recipe', path: null },
  { key: 'template', path: null },
  { key: 'repeat', path: '/add/repeat' },
] as const satisfies readonly { key: string; path: string | null }[];

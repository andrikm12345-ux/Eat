/**
 * Tiles of the "Добавить" sheet. `manual` is where AI tiles lead when AI is not set up
 * (no key / switched off): the manual equivalent.
 */
export const ADD_TILES = [
  { key: 'search', path: '/add/search' },
  { key: 'barcode', path: '/add/barcode' },
  { key: 'photoAi', path: '/add/ai-photo', manual: '/add/search' },
  { key: 'textAi', path: '/add/ai-text', manual: '/add/quick' },
  { key: 'labelAi', path: '/add/ai-label', manual: '/foods/new' },
  { key: 'quickKcal', path: '/add/quick' },
  { key: 'recipe', path: '/add/recipe' },
  { key: 'template', path: '/add/template' },
  { key: 'repeat', path: '/add/repeat' },
] as const satisfies readonly { key: string; path: string | null; manual?: string }[];

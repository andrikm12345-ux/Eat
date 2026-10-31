import type { ComponentType, SVGProps } from 'react';
import {
  IconBarcode,
  IconBolt,
  IconBook,
  IconCamera,
  IconCopy,
  IconRepeat,
  IconSearch,
  IconTag,
  IconText,
} from '../../ui/icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Tiles of the "Добавить" sheet, most used first. `manual` is where an AI tile leads when
 * AI is not set up (the manual equivalent).
 */
export const ADD_TILES = [
  { key: 'search', path: '/add/search', Icon: IconSearch },
  { key: 'barcode', path: '/add/barcode', Icon: IconBarcode },
  { key: 'textAi', path: '/add/ai-text', Icon: IconText },
  { key: 'photoAi', path: '/add/ai-photo', manual: '/add/search', Icon: IconCamera },
  { key: 'labelAi', path: '/add/ai-label', manual: '/foods/new', Icon: IconTag },
  { key: 'quickKcal', path: '/add/quick', Icon: IconBolt },
  { key: 'repeat', path: '/add/repeat', Icon: IconRepeat },
  { key: 'template', path: '/add/template', Icon: IconCopy },
  { key: 'recipe', path: '/add/recipe', Icon: IconBook },
] as const satisfies readonly { key: string; path: string | null; manual?: string; Icon: Icon }[];

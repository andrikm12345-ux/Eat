import { expect, it } from 'vitest';
import { normalizeSearch } from './text';

it('normalizes search keys', () => {
  expect(normalizeSearch('  Ёжики  в   ТУМАНЕ ')).toBe('ежики в тумане');
  expect(normalizeSearch('Творог 5%')).toBe('творог 5%');
});

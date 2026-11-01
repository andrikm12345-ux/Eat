import { describe, expect, it } from 'vitest';
import { isValidEan } from './ean';

describe('isValidEan', () => {
  it('accepts correct EAN-13, EAN-8 and UPC-A', () => {
    expect(isValidEan('4810268055577')).toBe(true);
    expect(isValidEan('7601741054531')).toBe(true);
    expect(isValidEan('96385074')).toBe(true);
    expect(isValidEan('036000291452')).toBe(true);
  });
  it('rejects a wrong check digit, wrong length and non-digits', () => {
    expect(isValidEan('4810268055578')).toBe(false);
    expect(isValidEan('481026805557')).toBe(false);
    expect(isValidEan('48102680555777')).toBe(false);
    expect(isValidEan('48102680555A7')).toBe(false);
    expect(isValidEan('')).toBe(false);
  });
});

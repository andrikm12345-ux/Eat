import { describe, expect, it } from 'vitest';
import { formatGrams, formatKcal, formatKg, formatSignedKcal, parseDecimal } from './format';

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('format', () => {
  it('kcal are integers with grouping', () => {
    expect(plain(formatKcal(2185.6))).toBe('2 186');
    expect(formatKcal(-0.2)).toBe('0');
  });
  it('grams up to one decimal with comma', () => {
    expect(formatGrams(12.34)).toBe('12,3');
    expect(formatGrams(12)).toBe('12');
    expect(formatGrams(-0.01)).toBe('0');
  });
  it('kg with exactly one decimal', () => {
    expect(formatKg(80)).toBe('80,0');
    expect(formatKg(79.96)).toBe('80,0');
    expect(formatKg(-0.04)).toBe('0,0');
  });
  it('signed kcal is neutral text', () => {
    expect(formatSignedKcal(180)).toBe('+180');
    expect(formatSignedKcal(-180)).toBe('−180');
    expect(formatSignedKcal(0)).toBe('0');
    expect(formatSignedKcal(-0.3)).toBe('0');
  });
  it('parses comma and dot decimals', () => {
    expect(parseDecimal('80,5')).toBe(80.5);
    expect(parseDecimal('80.5')).toBe(80.5);
    expect(parseDecimal(' 1 200 ')).toBe(1200);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5.')).toBe(5);
    expect(parseDecimal('-2,5')).toBe(-2.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { isoToRu, maskDate, maskTime, parseRuDate, parseRuTime } from './dateText';

describe('Russian date and time text', () => {
  it('formats ISO dates as ДД.ММ.ГГГГ', () => {
    expect(isoToRu('2026-11-01')).toBe('01.11.2026');
    expect(isoToRu('')).toBe('');
  });

  it('inserts the dots while typing', () => {
    expect(maskDate('0')).toBe('0');
    expect(maskDate('011')).toBe('01.1');
    expect(maskDate('01112026')).toBe('01.11.2026');
    expect(maskDate('01.11.2026999')).toBe('01.11.2026');
    expect(maskDate('аб')).toBe('');
  });

  it('accepts real days only', () => {
    expect(parseRuDate('01.11.2026')).toBe('2026-11-01');
    expect(parseRuDate('29.02.2024')).toBe('2024-02-29');
    expect(parseRuDate('29.02.2026')).toBeNull();
    expect(parseRuDate('31.04.2026')).toBeNull();
    expect(parseRuDate('00.11.2026')).toBeNull();
    expect(parseRuDate('01.13.2026')).toBeNull();
    expect(parseRuDate('01.11.1800')).toBeNull();
    expect(parseRuDate('01.11.26')).toBeNull();
  });

  it('time is 24-hour ЧЧ:ММ', () => {
    expect(maskTime('0')).toBe('0');
    expect(maskTime('060')).toBe('06:0');
    expect(maskTime('0600')).toBe('06:00');
    expect(maskTime('06001')).toBe('06:00');
    expect(parseRuTime('06:00')).toBe('06:00');
    expect(parseRuTime('23:59')).toBe('23:59');
    expect(parseRuTime('24:00')).toBeNull();
    expect(parseRuTime('12:60')).toBeNull();
    expect(parseRuTime('6:00')).toBeNull();
  });
});

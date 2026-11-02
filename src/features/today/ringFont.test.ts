import { describe, expect, it } from 'vitest';
import { formatKcal, formatSignedKcal } from '../../domain/format';
import { ringFont } from './ringFont';

describe('ringFont', () => {
  it('shrinks with the length of the number', () => {
    expect(ringFont('730')).toBe(36);
    expect(ringFont(formatKcal(2730))).toBe(36); // "2 730"
    expect(ringFont(formatKcal(12345))).toBe(28); // "12 345"
    expect(ringFont(formatSignedKcal(11725))).toBe(21); // "+11 725"
    expect(ringFont('+1 111 725')).toBe(21);
  });
});

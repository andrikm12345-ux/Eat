import { describe, expect, it } from 'vitest';
import { dayPins, greetingAt, lightness, linePos, seasonOf, skyAt, slotNow, slotOf } from './scene';

describe('the day scene', () => {
  it('the sky is dark at night with stars, light at noon without them', () => {
    expect(skyAt(23).dark).toBe(true);
    expect(skyAt(23).stars).toBe(1);
    expect(skyAt(12).dark).toBe(false);
    expect(skyAt(12).stars).toBe(0);
    // Colours blend between the key hours.
    expect(skyAt(18).mid).not.toBe(skyAt(17).mid);
    expect(lightness('#ffffff')).toBeCloseTo(1);
  });

  it('seasons and greetings', () => {
    expect(seasonOf(10)).toBe('autumn');
    expect(seasonOf(0)).toBe('winter');
    expect(seasonOf(4)).toBe('spring');
    expect(seasonOf(6)).toBe('summer');
    expect(greetingAt(8)).toBe('morning');
    expect(greetingAt(13)).toBe('day');
    expect(greetingAt(20)).toBe('evening');
    expect(greetingAt(2)).toBe('night');
  });

  it('meals by label first, then by time', () => {
    expect(slotOf({ time: '08:00' })).toBe('breakfast');
    expect(slotOf({ time: '13:00' })).toBe('lunch');
    expect(slotOf({ time: '17:30' })).toBe('snack');
    expect(slotOf({ time: '20:00' })).toBe('dinner');
    expect(slotOf({ time: '20:00', mealLabel: 'Перекус' })).toBe('snack');
    expect(slotNow(9)).toBe('breakfast');
    expect(slotNow(20)).toBe('dinner');
  });

  it('pins: one per meal, counted, at the first entry time, never on top of each other', () => {
    const pins = dayPins([
      { id: 'a', time: '08:10' },
      { id: 'b', time: '09:00' },
      { id: 'c', time: '13:20' },
    ]);
    expect(pins.map((p) => p.count)).toEqual([2, 1, 0, 0]);
    expect(pins[0]).toMatchObject({ time: '08:10', firstId: 'a' });
    expect(pins[0]!.pos).toBeCloseTo(linePos(8 * 60 + 10));
    for (let i = 1; i < pins.length; i++)
      expect(pins[i]!.pos - pins[i - 1]!.pos).toBeGreaterThanOrEqual(0.13 - 1e-9);
    // Late entries push the others back but nothing leaves the line.
    const late = dayPins([
      { id: 'x', time: '23:50' },
      { id: 'y', time: '23:55', mealLabel: 'Завтрак' },
    ]);
    expect(Math.max(...late.map((p) => p.pos))).toBeLessThanOrEqual(1);
    expect(Math.min(...late.map((p) => p.pos))).toBeGreaterThanOrEqual(0);
  });
});

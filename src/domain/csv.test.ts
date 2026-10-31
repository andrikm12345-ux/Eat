import { describe, expect, it } from 'vitest';
import { guessColumns, mapRows, parseCsv, parseDateFlexible, toCsv } from './csv';

describe('csv', () => {
  it('parses with auto delimiter, quotes, BOM and CRLF', () => {
    expect(parseCsv('﻿Дата;Шаги;Вес\r\n01.03.2026;"10 500";80,4\r\n\r\n02.03.2026;9000;')).toEqual([
      ['Дата', 'Шаги', 'Вес'],
      ['01.03.2026', '10 500', '80,4'],
      ['02.03.2026', '9000', ''],
    ]);
    expect(parseCsv('a,b\n"x, ""y""",2')).toEqual([
      ['a', 'b'],
      ['x, "y"', '2'],
    ]);
    expect(parseCsv('date\tsteps\n2026-03-01\t5000\n')).toEqual([
      ['date', 'steps'],
      ['2026-03-01', '5000'],
    ]);
  });
  it('serializes CSV', () => {
    expect(
      toCsv([
        ['a', 'b, c', null],
        [1, 'x"y', undefined],
      ]),
    ).toBe('a,"b, c",\r\n1,"x""y",');
  });
  it('flexible dates', () => {
    expect(parseDateFlexible('2026-03-01T07:15:00Z')).toBe('2026-03-01');
    expect(parseDateFlexible('1.3.2026')).toBe('2026-03-01');
    expect(parseDateFlexible('01/03/2026')).toBe('2026-03-01');
    expect(parseDateFlexible('2026/3/1')).toBe('2026-03-01');
    expect(parseDateFlexible('31.02.2026')).toBeNull();
    expect(parseDateFlexible('вчера')).toBeNull();
  });
  it('guesses columns', () => {
    expect(guessColumns(['Дата', 'Шаги', 'Активные ккал', 'Вес, кг'])).toMatchObject({
      date: 0,
      steps: 1,
      activeKcal: 2,
      weight: 3,
      workoutType: -1,
    });
    expect(guessColumns(['date', 'type', 'duration (min)', 'calories'])).toMatchObject({
      date: 0,
      workoutType: 1,
      duration: 2,
      workoutKcal: 3,
    });
  });
  it('maps rows and skips invalid ones', () => {
    const cols = guessColumns(['Дата', 'Шаги', 'Активные ккал', 'Вес']);
    const r = mapRows(
      [
        ['01.03.2026', '10 500', '420', '80,4'],
        ['bad', '1', '1', '80'],
        ['02.03.2026', '', '', ''],
        ['03.03.2026', '-5', '', '500'],
        ['04.03.2026', '7000', '', ''],
        ['05.03.2026'],
      ],
      cols,
    );
    expect(r.ok).toEqual([
      { date: '2026-03-01', steps: 10500, activeKcal: 420, weight: 80.4 },
      { date: '2026-03-04', steps: 7000 },
    ]);
    expect(r.skipped).toBe(4);
  });
  it('maps workouts (with or without a type column)', () => {
    const cols = guessColumns(['date', 'type', 'duration', 'calories']);
    expect(
      mapRows(
        [
          ['2026-03-01', 'Бег', '30', '300'],
          ['2026-03-02', '', '20', ''],
        ],
        cols,
      ).ok,
    ).toEqual([{ date: '2026-03-01', workout: { type: 'Бег', durationMin: 30, kcal: 300 } }]);
    const noType = guessColumns(['date', 'duration']);
    expect(mapRows([['2026-03-01', '45']], noType).ok).toEqual([
      { date: '2026-03-01', workout: { type: 'Тренировка', durationMin: 45 } },
    ]);
  });
});

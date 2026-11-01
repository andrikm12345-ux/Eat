import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/i18n/ru.ts'), 'utf8');

describe('Russian typography of the texts', () => {
  it('a number and its unit are joined by a non-breaking space', () => {
    const loose = source.match(
      /(?:\d|\}) (?:ккал|кг\/нед|кг|мл|мин|см|г|%)(?![а-яёА-ЯЁa-zA-Z0-9/])/g,
    );
    expect(loose).toBeNull();
  });

  it('quotes are «ёлочки» and dashes are —', () => {
    expect(source).not.toMatch(/"[А-Яа-яЁё][^"\n]*"/);
    expect(source).not.toMatch(/[А-Яа-яЁё)] - [А-Яа-яЁё(]/);
  });

  it('really contains non-breaking spaces', () => {
    expect(source.split(' ').length).toBeGreaterThan(20);
  });
});

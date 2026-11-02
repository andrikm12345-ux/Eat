import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** All style files under a folder. */
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('no blurred backgrounds', () => {
  it('backdrop-filter is not used in any style (on iOS WebKit it leaves dark rectangles)', () => {
    const offenders = cssFiles(join(process.cwd(), 'src')).filter((f) =>
      /^[^/*\n]*backdrop-filter\s*:/m.test(
        readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

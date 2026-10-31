// Fails the build if the eagerly loaded JS (entry + its static imports) exceeds the gzip budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const dist = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');

const eager = new Set();
for (const m of html.matchAll(
  /<(?:script|link)[^>]+(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g,
)) {
  eager.add(m[1]);
}
let total = 0;
const rows = [];
for (const file of eager) {
  const size = gzipSync(readFileSync(new URL(file, dist))).length;
  total += size;
  rows.push(`  ${file}  ${(size / 1024).toFixed(1)} KB gz`);
}
console.log(
  `Eager bundle (gzip):\n${rows.join('\n')}\n  total ${(total / 1024).toFixed(1)} KB / ${BUDGET_KB} KB`,
);
if (total > BUDGET_KB * 1024) {
  console.error('Bundle budget exceeded');
  process.exit(1);
}

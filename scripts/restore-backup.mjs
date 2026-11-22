#!/usr/bin/env node
/**
 * Puts a backup back into the storage, through the server (only it can decrypt the files).
 *   BACKUP_TOKEN=... node scripts/restore-backup.mjs <folder-with-json-files> [site]
 * The folder is one day of the `backups` branch: data/YYYY-MM-DD.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, site = 'https://dnevnik-theta.vercel.app'] = process.argv.slice(2);
const token = process.env.BACKUP_TOKEN;
if (!dir || !token) {
  console.error('Usage: BACKUP_TOKEN=... node scripts/restore-backup.mjs <folder> [site]');
  process.exit(2);
}
let total = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const res = await fetch(`${site}/api/backup`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: readFileSync(join(dir, name), 'utf8'),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`${name}: ${res.status} ${JSON.stringify(out)}`);
    process.exit(1);
  }
  total += out.written ?? 0;
  console.log(`${name}: ${out.written} files`);
}
console.log(`Restored ${total} files.`);

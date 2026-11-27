#!/usr/bin/env node
/**
 * Opens one sealed backup file on your own computer (for example the saved settings):
 *   BACKUP_KEY=... node scripts/open-backup.mjs data/2026-11-27/env_.json
 * Prints the files inside as JSON. The key is read from the environment, never from an argument.
 * Do not run it where the screen or the history is shared: the settings contain secrets.
 */
import { createDecipheriv, hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const key = process.env.BACKUP_KEY;
const file = process.argv[2];
if (!key || !file) {
  console.error('Usage: BACKUP_KEY=... node scripts/open-backup.mjs <sealed-file.json>');
  process.exit(2);
}
const sealed = JSON.parse(readFileSync(file, 'utf8'));
const k = Buffer.from(hkdfSync('sha256', key, 'dnevnik-backup', 'backup-v1', 32));
const raw = Buffer.from(sealed.data, 'base64');
const d = createDecipheriv('aes-256-gcm', k, Buffer.from(sealed.iv, 'base64'));
d.setAuthTag(raw.subarray(raw.length - 16));
const text = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString(
  'utf8',
);
console.log(JSON.stringify(JSON.parse(text), null, 2));

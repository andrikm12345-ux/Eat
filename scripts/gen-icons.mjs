// Generates simple geometric PNG icons without any dependencies.
// Run once: `npm run icons`. Output is committed to public/icons.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [0x2f, 0x6f, 0x6a]; // muted teal
const FG = [0xf6, 0xf5, 0xf2];
const SS = 4; // supersampling factor for anti-aliasing

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Render using shape predicates in unit space [0,1].
 * bg(x,y) -> boolean (background coverage), fg(x,y) -> boolean (foreground glyph).
 */
function render(size, bg, fg) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (bg(x, y)) {
            bgHits++;
            if (fg(x, y)) fgHits++;
          }
        }
      }
      const n = SS * SS;
      const a = bgHits / n;
      const f = bgHits ? fgHits / bgHits : 0;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      out[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, out);
}

const roundedSquare = (r) => (x, y) => {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const full = () => true;
const dist = (x, y, cx = 0.5, cy = 0.5) => Math.hypot(x - cx, y - cy);

// Main glyph: a ring with a centered dot — abstract "plate".
const glyph = (scale) => (x, y) => {
  const u = 0.5 + (x - 0.5) / scale;
  const v = 0.5 + (y - 0.5) / scale;
  const d = dist(u, v);
  const ring = d >= 0.24 && d <= 0.33;
  const dot = d <= 0.09;
  return ring || dot;
};

const plus = (x, y) =>
  (Math.abs(x - 0.5) <= 0.07 && Math.abs(y - 0.5) <= 0.28) ||
  (Math.abs(y - 0.5) <= 0.07 && Math.abs(x - 0.5) <= 0.28);
const scale = (x, y) => {
  const d = dist(x, y, 0.5, 0.55);
  const ring = d >= 0.2 && d <= 0.28;
  const needle = Math.abs(x - 0.5) <= 0.04 && y >= 0.36 && y <= 0.55;
  return ring || needle;
};
const barcode = (x, y) => {
  if (y < 0.28 || y > 0.72 || x < 0.22 || x > 0.78) return false;
  const bars = [0.04, 0.02, 0.06, 0.02, 0.04, 0.03, 0.02, 0.05];
  let pos = 0.22;
  for (let i = 0; i < bars.length; i++) {
    if (x >= pos && x < pos + bars[i]) return true;
    pos += bars[i] + 0.03;
  }
  return false;
};

const files = {
  'icon-192.png': render(192, roundedSquare(0.22), glyph(1)),
  'icon-512.png': render(512, roundedSquare(0.22), glyph(1)),
  'icon-maskable-512.png': render(512, full, glyph(0.78)),
  'apple-touch-icon.png': render(180, full, glyph(0.9)),
  'shortcut-add-96.png': render(96, roundedSquare(0.22), plus),
  'shortcut-weight-96.png': render(96, roundedSquare(0.22), scale),
  'shortcut-scan-96.png': render(96, roundedSquare(0.22), barcode),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, OUT), buf);
console.log(`Wrote ${Object.keys(files).length} icons to public/icons`);

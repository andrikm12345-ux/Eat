// Brand icons and iOS launch screens: a sunset sky with autumn leaves and a green plate with
// fork and knife (same look as the day card). Run: `npm run icons`.
// Needs Playwright (Chromium) only to turn the SVG into PNG; the output is committed.
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const PUBLIC = join(__dirname, '..', 'public');
const ICONS = join(PUBLIC, 'icons');
const SPLASH = join(PUBLIC, 'splash');
mkdirSync(ICONS, { recursive: true });
mkdirSync(SPLASH, { recursive: true });

/** A fixed pseudo-random sequence, so every run draws the same sky. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const LEAF = 'M0 -6 C 4 -4 5 2 0 6 C -5 2 -4 -4 0 -6 Z';
const LEAVES = ['#e8913a', '#d4552f', '#e8b23a', '#c9402b', '#b8652a'];

const DEFS = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30355e"/><stop offset=".55" stop-color="#7c4a6b"/><stop offset="1" stop-color="#e5875a"/></linearGradient>
<radialGradient id="green" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e2f9cc"/><stop offset=".55" stop-color="#b6e98e"/><stop offset="1" stop-color="#7fc957"/></radialGradient></defs>`;

function stars(r) {
  let out = '';
  for (let i = 0; i < 22; i++) {
    const x = 40 + r() * 430;
    const y = 40 + r() * 260;
    const rad = r() < 0.7 ? 2 : 3;
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad}" fill="#fff" opacity="${(0.5 + r() * 0.4).toFixed(2)}"/>`;
  }
  return out;
}
function leaves(r, n = 46) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = 10 + r() * 490;
    const y = 414 + r() * 98;
    const s = 1.6 + r() * 1.2;
    out += `<path d="${LEAF}" fill="${LEAVES[i % LEAVES.length]}" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${(r() * 360).toFixed(0)}) scale(${s.toFixed(2)})"/>`;
  }
  return out;
}
const PLATE = (extra) => `<g ${extra}><circle cx="256" cy="232" r="132" fill="url(#green)"/>
<g fill="none" stroke="#1d3b2f" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"><path d="M206 160v62a22 22 0 0 0 44 0v-62M228 160v150M306 160c-26 26-26 80 0 104v46"/></g></g>`;
const SHORTCUT = {
  add: '<path d="M256 168v128M192 232h128" fill="none" stroke="#1d3b2f" stroke-width="26" stroke-linecap="round"/>',
  weight:
    '<g fill="none" stroke="#1d3b2f" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"><path d="M176 304h160l-18-96H194z"/><path d="M256 232l22-30"/></g>',
  scan: [0, 1, 2, 3, 4, 5]
    .map((i) => `<rect x="${186 + i * 24}" y="176" width="${i % 2 ? 10 : 16}" height="112" rx="4" fill="#1d3b2f"/>`)
    .join(''),
};

/** The icon as an SVG string. glyph: 'plate' or a shortcut name; safe: scale for maskable. */
function svg({ round, glyph = 'plate', safe = 1, size = 512, seed = 7 }) {
  const r = seeded(seed);
  const body =
    glyph === 'plate'
      ? PLATE(`transform="translate(256 256) scale(${safe}) translate(-256 -256)"`)
      : `<circle cx="256" cy="232" r="132" fill="url(#green)"/>${SHORTCUT[glyph]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${DEFS}
<clipPath id="c"><rect width="512" height="512" rx="${round ? 112 : 0}"/></clipPath>
<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#sky)"/>${stars(r)}${body}${leaves(r)}</g></svg>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const png = async (markup, w, h, transparent = true) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(
      `<body style="margin:0;background:${transparent ? 'transparent' : '#fff'}">${markup}</body>`,
    );
    return page.screenshot({ omitBackground: transparent, type: 'png' });
  };
  const write = (dir, name, buf) => writeFileSync(join(dir, name), buf);

  writeFileSync(join(PUBLIC, 'favicon.svg'), svg({ round: true, size: 64 }));
  write(ICONS, 'icon-192.png', await png(svg({ round: true, size: 192 }), 192, 192));
  write(ICONS, 'icon-512.png', await png(svg({ round: true }), 512, 512));
  // iOS rounds the corners itself and wants an opaque square.
  write(ICONS, 'apple-touch-icon.png', await png(svg({ round: false, size: 180 }), 180, 180, false));
  write(ICONS, 'icon-maskable-512.png', await png(svg({ round: false, safe: 0.8 }), 512, 512, false));
  for (const g of ['add', 'weight', 'scan'])
    write(ICONS, `shortcut-${g}-96.png`, await png(svg({ round: true, glyph: g, size: 96, seed: 3 }), 96, 96));

  const SIZES = [[1290, 2796], [1179, 2556], [1170, 2532], [1125, 2436], [828, 1792], [750, 1334]];
  const THEMES = { light: '#f4f1ec', dark: '#111513' };
  for (const [theme, bg] of Object.entries(THEMES)) {
    for (const [w, h] of SIZES) {
      const s = Math.round(w * 0.26);
      const top = Math.round((h - s) / 2 - h * 0.03);
      const logo = svg({ round: true, size: s });
      write(SPLASH, `${theme}-${w}x${h}.png`, await png(
        `<div style="width:${w}px;height:${h}px;background:${bg};position:relative"><div style="position:absolute;left:${Math.round((w - s) / 2)}px;top:${top}px">${logo}</div></div>`,
        w, h, false));
    }
  }
  await browser.close();
  console.log('ok');
})();

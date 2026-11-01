"""Brand icon + iOS launch screens (light/dark). Run: python3 scripts/gen_brand.py"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
ICONS = os.path.join(OUT, 'icons')
os.makedirs(os.path.join(OUT, 'splash'), exist_ok=True)
G1, G2 = (0x3a, 0xa8, 0x97), (0x1a, 0x62, 0x58)
SS = 4

def gradient(n):
    img = Image.new('RGB', (n, n))
    px = img.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * n)
            px[x, y] = tuple(int(G1[i] * (1 - t) + G2[i] * t) for i in range(3))
    return img

def mark(draw, cx, cy, r, w, fg, track):
    """A progress ring (3/4 filled) with a dot in the middle: the app's calorie ring."""
    box = [cx - r, cy - r, cx + r, cy + r]
    draw.ellipse(box, outline=track, width=w)
    draw.arc(box, -90, 180, fill=fg, width=w)
    for ang in (-90, 180):
        a = math.radians(ang)
        x, y = cx + (r - w / 2) * math.cos(a), cy + (r - w / 2) * math.sin(a)
        draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fg)
    d = w * 0.62
    draw.ellipse([cx - d, cy - d, cx + d, cy + d], fill=fg)

def icon(size, scale=1.0, rounded=True):
    n = size * SS
    img = gradient(n)
    d = ImageDraw.Draw(img, 'RGBA')
    r = n * 0.26 * scale
    mark(d, n / 2, n / 2, r, int(n * 0.085 * scale), (255, 255, 255, 255), (255, 255, 255, 80))
    img = img.convert('RGBA')
    if rounded:
        mask = Image.new('L', (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)

def save(img, name):
    img.save(os.path.join(ICONS, name), optimize=True)

save(icon(192), 'icon-192.png')
save(icon(512), 'icon-512.png')
# iOS rounds the corners itself and wants an opaque square.
save(icon(180, rounded=False).convert('RGB'), 'apple-touch-icon.png')
save(icon(512, scale=0.8, rounded=False).convert('RGB'), 'icon-maskable-512.png')

SPLASH = [(1290, 2796), (1179, 2556), (1170, 2532), (1125, 2436), (828, 1792), (750, 1334)]
THEMES = {'light': (0xf4, 0xf5, 0xf2), 'dark': (0x11, 0x15, 0x13)}
for theme, bg in THEMES.items():
    for w, h in SPLASH:
        img = Image.new('RGB', (w, h), bg)
        logo = icon(int(w * 0.26))
        img.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2 - int(h * 0.03)), logo)
        img.save(os.path.join(OUT, 'splash', f'{theme}-{w}x{h}.png'), optimize=True)
print('ok')

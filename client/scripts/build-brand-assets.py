#!/usr/bin/env python3
"""
Derive every raster icon from the ONE master Kepo mark.

  master:  client/src/assets/brand/kepo-mark.svg   (indigo tile + white K/pin glyph)
  outputs: client/public/favicon.svg  (byte-identical copy of the master, so the
                          favicon needs no build-time URL rewriting)
           client/public/{favicon-16,favicon-32,icon-192,icon-512,
                          maskable-icon-192,maskable-icon-512,apple-touch-icon}.png
           client/public/favicon.ico

Nothing here redraws the mark. The glyph and tile path data are read from the
master and re-used verbatim; only the *canvas* differs per platform:

  any (favicon, icon-192/512)  the master tile itself, centred in a square,
                               transparent corners (as in the reference).
  maskable                     full-bleed indigo square, the glyph unchanged in
                               shape and position, scaled down just enough to
                               sit inside the 80% maskable safe circle.
  apple-touch-icon             full-bleed indigo square (iOS rounds it itself),
                               glyph at exactly the reference scale.

Run from client/:  python3 scripts/build-brand-assets.py
Needs: Python 3, Pillow, numpy and Playwright with Chromium (dev machine only —
not project dependencies). Re-run only when the master SVG changes.
"""
import io
import re
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / 'src/assets/brand/kepo-mark.svg'
PUBLIC = ROOT / 'public'

svg = MASTER.read_text()
vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
W, H = vb[2], vb[3]
paths = re.findall(r'<path fill="([^"]+)"(?: fill-rule="([^"]+)")? d="([^"]+)"', svg)
(BRAND, _, TILE_D), (GLYPH_FILL, GLYPH_RULE, GLYPH_D) = paths
assert GLYPH_FILL.upper() == '#FFFFFF' and GLYPH_RULE == 'evenodd'


def full_bleed_svg(scale: float) -> str:
    """Square indigo canvas (side = tile width); glyph position relative to the tile centre is
    preserved, then uniformly scaled by `scale` about that centre."""
    s = W
    tx, ty = s / 2, s / 2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}">'
        f'<rect width="{s}" height="{s}" fill="{BRAND}"/>'
        f'<g transform="translate({tx} {ty}) scale({scale}) translate({-W / 2} {-H / 2})">'
        f'<path fill="#FFFFFF" fill-rule="evenodd" d="{GLYPH_D}"/></g></svg>'
    )


def render(page, svg_text: str, px: int, transparent: bool) -> Image.Image:
    page.set_viewport_size({'width': px, 'height': px})
    page.set_content(
        '<html><body style="margin:0;background:transparent">'
        f'<div style="width:{px}px;height:{px}px">{svg_text}</div>'
        '<style>svg{width:100%;height:100%;display:block}</style></body></html>'
    )
    png = page.screenshot(omit_background=transparent)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def glyph_safe_scale(page) -> float:
    """Largest scale (<=1) at which every glyph pixel stays inside the maskable safe circle
    (radius 40% of the canvas), measured on a high-res render of the actual glyph."""
    px = 1430
    img = render(page, full_bleed_svg(1.0), px, False)
    a = np.array(img.convert('RGB')).astype(int)
    ys, xs = np.where(a.min(axis=2) > 200)  # white glyph pixels
    cx = cy = px / 2
    r = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()
    return min(1.0, 0.40 * px / r)


def write_ico(path: Path, images: list[Image.Image]):
    blobs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, format='PNG')
        blobs.append(buf.getvalue())
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b''
    for im, blob in zip(images, blobs):
        w, h = im.size
        entries += struct.pack('<BBBBHHII', w % 256, h % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    path.write_bytes(header + entries + b''.join(blobs))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        def save(img, name):
            img.save(PUBLIC / name, optimize=True)
            print('wrote', name, img.size)

        # SVG favicon: an exact copy of the master.
        (PUBLIC / 'favicon.svg').write_text(svg)
        print('wrote favicon.svg (copy of master)')

        # "any" icons: the master tile, undistorted, centred in a square canvas.
        for px, name in [(16, 'favicon-16.png'), (32, 'favicon-32.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
            save(render(page, svg, px, True), name)
        ico = [render(page, svg, px, True) for px in (16, 32, 48)]
        write_ico(PUBLIC / 'favicon.ico', ico)
        print('wrote favicon.ico (16, 32, 48)')

        # Maskable: full-bleed, glyph scaled just enough to respect the safe zone.
        k = glyph_safe_scale(page)
        print(f'maskable glyph scale {k:.4f}')
        for px in (192, 512):
            save(render(page, full_bleed_svg(k), px, False).convert('RGB'), f'maskable-icon-{px}.png')

        # Apple touch icon: full-bleed, glyph at the reference scale (iOS applies its own corner mask).
        save(render(page, full_bleed_svg(1.0), 180, False).convert('RGB'), 'apple-touch-icon.png')
        browser.close()


if __name__ == '__main__':
    sys.exit(main())

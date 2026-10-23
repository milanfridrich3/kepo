#!/usr/bin/env python3
"""
Render landing-page/src/og-image.jpg (1200 x 630) for Open Graph / Twitter cards.

The mark is read verbatim from client/src/assets/brand/kepo-mark.svg; colours follow the
dark theme tokens of landing-page/src/styles.css; the typeface is Inter (as on the landing page).

Run from the repository root:  python3 landing-page/scripts/build-og-image.py
Needs (dev machine only, not project dependencies): Python 3, Playwright with Chromium, Pillow,
and the Inter font installed locally. Re-run only when the branding or the tagline changes.
"""
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
mark = (root / "client/src/assets/brand/kepo-mark.svg").read_text()
out = root / "landing-page/src/og-image.jpg"

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#0F172A;font-family:'Inter',sans-serif;position:relative;overflow:hidden;color:#F1F5F9}}
.glow{{position:absolute;inset:0;background:
  radial-gradient(520px 420px at 6% 0%,rgba(78,50,231,.32),transparent 70%),
  radial-gradient(620px 520px at 100% 100%,rgba(54,29,192,.28),transparent 70%)}}
.wrap{{position:absolute;left:90px;top:80px;width:820px}}
.logo{{display:flex;align-items:center;gap:20px;margin-bottom:56px}}
.logo svg{{width:84px;height:auto;display:block;filter:drop-shadow(0 0 24px rgba(78,50,231,.55))}}
.word{{font-size:44px;font-weight:700;letter-spacing:-.02em}}
h1{{font-size:78px;line-height:1.06;font-weight:700;letter-spacing:-.035em}}
h1 span{{color:#8B7BFF}}
p{{margin-top:34px;font-size:27px;line-height:1.45;color:#94A0B8;font-weight:400}}
</style></head><body><div class="glow"></div><div class="wrap">
<div class="logo">{mark}<div class="word">Kepo</div></div>
<h1>Know what you own.<br><span>Know where it is.</span></h1>
<p>A personal inventory for your belongings: what you have, where it is, who has it and when the warranty ends.</p>
</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.set_content(html)
    pg.evaluate("document.fonts.ready")
    png = pg.screenshot()
    b.close()

Image.open(io.BytesIO(png)).convert("RGB").save(out, "JPEG", quality=88, optimize=True)
print("wrote", out, out.stat().st_size, "bytes")

"""Render the still images of the 3D scenes (site-src/src/vis/*.webp).

Run against a local build:  python3 site-src/tests/posters.py [shot ...]
Needs playwright and Pillow. The stills are what visitors without a GPU see, and what everyone sees until the 3D model has loaded.
For the "case" shot put two screenshots next to this file's output folder: vis-src/buyauto-d.webp (1600x974) and vis-src/buyauto-m.webp (720x1558).
"""
import asyncio, base64, io, os, sys
from playwright.async_api import async_playwright
from PIL import Image

BASE = os.environ.get("BASE", "http://localhost:3100")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "vis")
SRC = os.path.join(ROOT, "vis-src")
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
W, T, P = (1600, 900), (900, 720), (800, 1400)   # wide (device beside the text), small box, narrow (device behind the text)
# name, page, shot, sizes {suffix: (w, h)}, per language
JOBS = [
    ("web", "/webdesign", "web", {"w": W, "p": P}, True),
    ("local", "/webdesign-schlieren", "local", {"w": W, "p": P}, True),
    ("ads", "/google-ads", "ads", {"w": W, "p": P}, True),
    ("app", "/app-entwicklung", "app", {"w": W, "p": P}, True),
    ("auto", "/ki-automation", "auto", {"w": W, "p": P}, True),
    ("case", "/webdesign", "case", {"w": W, "t": T}, False),
]

ISO = "header,footer,.cb,.skip,.svfg,.svtag,.pg{display:none!important}html,body{background:#000!important;overflow:hidden!important}.sv{margin:0!important}.svbg{position:fixed!important;inset:0!important;height:100vh!important}.svbg img{display:none!important}.svbg canvas{opacity:1!important;transition:none!important}"

def data_url(path):
    return "data:image/webp;base64," + base64.b64encode(open(path, "rb").read()).decode()

async def main():
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=ARGS, executable_path=os.environ.get("CHROME") or None)
        for name, page, shot, sizes, per_lang in JOBS:
            if want and name not in want:
                continue
            if shot == "case" and not os.path.exists(os.path.join(SRC, "buyauto-d.webp")):
                print("skip case: no screenshots in vis-src/"); continue
            for lang in (("de", "en") if per_lang else ("",)):
                for suf, (w, h) in sizes.items():
                    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                    pg = await ctx.new_page()
                    if shot == "case":
                        await pg.add_init_script("window.__shot='case';window.__caseImgs={d:new Image(),m:new Image()};window.__caseImgs.d.src=%r;window.__caseImgs.m.src=%r;" % (data_url(os.path.join(SRC, "buyauto-d.webp")), data_url(os.path.join(SRC, "buyauto-m.webp"))))
                    await pg.add_init_script("try{localStorage.setItem('vm-consent','no')}catch(e){}")
                    await pg.goto(BASE + ("/en" if lang == "en" else "") + page + "?gl=1&poster=1")
                    await pg.add_style_tag(content=ISO)
                    await pg.wait_for_function("window.__posterReady === true", timeout=90000)
                    await pg.wait_for_timeout(700)
                    png = await pg.screenshot(clip={"x": 0, "y": 0, "width": w, "height": h})
                    im = Image.open(io.BytesIO(png)).convert("RGB")
                    f = os.path.join(OUT, "-".join(x for x in (name, lang, suf) if x) + ".webp")
                    im.save(f, "WEBP", quality=int(os.environ.get("Q", "78")), method=6)
                    print(os.path.basename(f), im.size, os.path.getsize(f) // 1024, "KB")
                    await ctx.close()
        await b.close()

asyncio.run(main())

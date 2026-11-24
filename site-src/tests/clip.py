"""Render a short preview clip of the 3D devices, frame by frame, from a local build.

python3 site-src/tests/clip.py out.mp4      (needs playwright and ffmpeg; the site must run on BASE)
Each frame is an exact moment of the scene, so the clip is smooth even on a machine without a GPU.
"""
import asyncio, math, os, shutil, subprocess, sys, tempfile
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
W, H, FPS = int(os.environ.get("CW", "1280")), int(os.environ.get("CH", "720")), int(os.environ.get("FPS", "24"))
ease = lambda x: 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))
# page, seconds, start of the screen loop
PARTS = [("/webdesign", 5.5, 0.0), ("/ki-automation", 8.2, 0.0), ("/app-entwicklung", 6.6, 2.2), ("/google-ads", 7.0, 0.0)]
CSS = "header,footer,.cb,.skip,.svfg,.svtag,.pg{display:none!important}html,body{background:#000!important;overflow:hidden!important}.sv{margin:0!important}.svbg{position:fixed!important;inset:0!important;height:100vh!important}.svbg img{display:none!important}.svbg canvas{opacity:1!important;transition:none!important}"

async def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "clip.mp4"
    tmp = tempfile.mkdtemp(); n = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=ARGS, executable_path=os.environ.get("CHROME") or None)
        for page, secs, start in PARTS:
            ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg = await ctx.new_page()
            await pg.add_init_script("try{localStorage.setItem('vm-consent','no')}catch(e){}")
            await pg.goto(BASE + page + "?gl=1&poster=1")
            await pg.add_style_tag(content=CSS)
            await pg.wait_for_function("window.__posterReady === true", timeout=90000)
            for i in range(int(min(secs, float(os.environ.get("MAXS", "99"))) * FPS)):
                t = i / FPS
                f = {"t": t, "tt": start + t, "p": 0.05 + 0.8 * ease(t / secs), "px": 0.55 * math.sin(t * 0.9 + 0.4) * ease(t / 1.5), "py": 0.3 * math.sin(t * 0.6)}
                await pg.evaluate("f => window.__scene.seek(f)", f)
                await pg.screenshot(path=os.path.join(tmp, "f%05d.jpg" % n), type="jpeg", quality=93); n += 1
            await ctx.close(); print(page, "done", n, flush=True)
        await b.close()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%05d.jpg"), "-vf", "crop=%d:%d:0:0,format=yuv420p" % (W, H), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", out], check=True)
    shutil.rmtree(tmp); print(out, os.path.getsize(out) // 1024, "KB")

asyncio.run(main())

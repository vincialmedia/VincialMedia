import asyncio, json, re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))   # screenshots land in tests/shots, which git ignores
os.makedirs("shots", exist_ok=True)
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--no-sandbox"]
B=os.environ.get("BASE","http://localhost:3100")
ROUTES=["/","/app-entwicklung","/webdesign","/google-ads","/ki-automation","/webdesign-schlieren","/webdesign-dietikon","/webdesign-urdorf","/preise","/impressum","/datenschutz"]
async def sweep(pg):
    h=await pg.evaluate("document.documentElement.scrollHeight"); y=0
    while y<h:
        await pg.evaluate(f"window.scrollTo(0,{y})"); await pg.wait_for_timeout(90); y+=600
        h=await pg.evaluate("document.documentElement.scrollHeight")
    await pg.wait_for_timeout(1400)
HIDDEN="(()=>{const bad=[];document.querySelectorAll('main .rv,main .sg>*,main .roll>i,main .pg>*').forEach(e=>{const c=getComputedStyle(e);if(+c.opacity<.99)bad.push((e.className||e.tagName)+':'+c.opacity)});return bad.slice(0,5)})()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); out={"pages":{}}
        for name,vp in (("desktop",{"width":1440,"height":900}),("mobile",{"width":390,"height":844})):
            ctx=await b.new_context(viewport=vp); pg=await ctx.new_page(); errs=[]; ext=set()
            pg.on("pageerror",lambda e:errs.append(str(e)))
            pg.on("console",lambda m: errs.append("console:"+m.text) if m.type=="error" else None)
            pg.on("request",lambda r: ext.add(r.url.split('?')[0]) if not r.url.startswith(B) and not r.url.startswith(("data:","blob:")) else None)
            for lang in ("de","en"):
                for r in ROUTES:
                    path = r if lang=="de" else ("/en" if r=="/" else "/en"+r)
                    resp=await pg.goto(B+path); await pg.wait_for_timeout(250)
                    info=await pg.evaluate("""()=>({t:document.title,h1:document.querySelector('h1')?.innerText.replace(/\\n/g,' '),canon:document.querySelector('link[rel=canonical]')?.href,alt:[...document.querySelectorAll('link[rel=alternate]')].length,
                      ld:(()=>{try{return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].map(x=>x['@type']).join(',')}catch(e){return 'ERR '+e}})(),
                      desc:document.querySelector('meta[name=description]')?.content.length, h1n:document.querySelectorAll('h1').length, ovf:document.documentElement.scrollWidth-innerWidth,
                      links:[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(h=>h.length>1&&!document.getElementById(h.slice(1))) })""")
                    info["missing"]=await pg.evaluate("""async()=>{const u=[...new Set([...document.querySelectorAll('script[src],link[rel=preload],img[src],source[srcset],[data-src]')].map(e=>e.src||e.href||e.srcset||e.dataset.src).filter(x=>x&&x.includes('/assets/')))];const bad=[];for(const x of u){const r=await fetch(x,{method:'HEAD'});if(!r.ok)bad.push(x)}return bad}""")
                    await sweep(pg)
                    info["hidden"]=await pg.evaluate(HIDDEN); info["status"]=resp.status
                    out["pages"].setdefault(path,{})[name]=info
            # home behaviour
            await pg.goto(B+"/"); await pg.wait_for_timeout(600)
            r={}
            r["consentShown"]=await pg.evaluate("!document.getElementById('cb').hidden")
            r["extBeforeConsent"]=sorted(ext)
            await pg.click("#cno"); await pg.wait_for_timeout(200)
            await pg.evaluate("document.querySelector('#finder').scrollIntoView()"); await pg.wait_for_timeout(800)
            await pg.click('#svc [data-k="app"]'); await pg.click('[data-svc="app"][data-size="m"]'); await pg.click('#svc [data-k="auto"]')
            r["totals"]=await pg.evaluate("[document.getElementById('t1').innerText,document.getElementById('t2').innerText]")
            await pg.click("#go"); await pg.wait_for_timeout(200)
            r["formVisible"]=await pg.evaluate("!document.getElementById('qf').hidden && document.activeElement.name")
            await pg.click("#qf [type=submit]"); await pg.wait_for_timeout(200)
            r["invalidMsg"]=await pg.evaluate("[document.getElementById('e-name').innerText, document.getElementById('e-email').innerText, document.querySelector('#qf [name=name]').getAttribute('aria-invalid'), document.activeElement.name]")
            await pg.fill("#qf [name=name]","Test Person"); await pg.fill("#qf [name=email]","test@example.ch"); await pg.fill("#qf [name=phone]","+41 79 000 00 00"); await pg.fill("#qf [name=msg]","Maler in Dietikon, Website von 2014.")
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=f"shots/e2e_form_{name}.png")
            await pg.click("#qf [type=submit]")
            try: await pg.wait_for_function("!document.getElementById('qdone').hidden || !document.getElementById('qerr').hidden", timeout=9000)
            except Exception: pass
            r["doneMsg"]=await pg.evaluate("document.getElementById('qdone').hidden?null:document.getElementById('qdone').innerText")
            r["locked"]=await pg.evaluate("[document.getElementById('finder').classList.contains('sent'), !document.getElementById('qagain').hidden, document.querySelector('#svc .chip').disabled]")
            r["errAfterSend"]=await pg.evaluate("document.getElementById('qerr').hidden?null:document.getElementById('qerr').innerText")
            await pg.screenshot(path=f"shots/e2e_done_{name}.png")
            # preselect from a service page
            await pg.goto(B+"/en/google-ads"); await pg.wait_for_timeout(300)
            await pg.click(".pg > a.pill.big"); await pg.wait_for_timeout(900)
            r["preselect"]=await pg.evaluate("[location.pathname+location.search+location.hash,[...document.querySelectorAll('#svc .chip[aria-pressed=true]')].map(c=>c.dataset.k)]")
            # language link and FAQ
            await pg.goto(B+"/preise"); await pg.wait_for_timeout(300)
            r["langHref"]=await pg.evaluate("document.querySelector('.langb').getAttribute('href')")
            await pg.evaluate("document.querySelector('.faq').scrollIntoView()"); await pg.wait_for_timeout(900)
            await pg.click(".faq .q button"); await pg.wait_for_timeout(600)
            r["faqOpen"]=await pg.evaluate("document.querySelector('.faq .ans').getBoundingClientRect().height")
            await pg.click('[data-jump="lv-ads"]'); await pg.wait_for_timeout(900)
            r["jumpTop"]=await pg.evaluate("Math.round(document.getElementById('lv-ads').getBoundingClientRect().top)")
            if name=="mobile":
                await pg.goto(B+"/"); await pg.wait_for_timeout(300)
                await pg.click("#burger"); await pg.wait_for_timeout(300)
                r["menuOpen"]=await pg.evaluate("document.getElementById('nav').classList.contains('open')")
                await pg.screenshot(path="shots/e2e_menu_mobile.png")
            r["errors"]=errs[:8]; r["external"]=sorted(ext)
            out[name]=r; await ctx.close()
        # no JavaScript: content must still be readable
        ctx=await b.new_context(java_script_enabled=False, viewport={"width":390,"height":844}); pg=await ctx.new_page()
        await pg.goto(B+"/"); 
        out["noJS"]={"h1":await pg.evaluate("1"), "home":(await pg.content()).count('class="q"'), "visibleHidden":0}
        await pg.screenshot(path="shots/e2e_nojs_home.png", full_page=False)
        await pg.goto(B+"/ki-automation"); await pg.screenshot(path="shots/e2e_nojs_page.png")
        await ctx.close(); await b.close()
        print(json.dumps(out,ensure_ascii=False))
asyncio.run(main())

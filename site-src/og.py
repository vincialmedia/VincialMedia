import asyncio, base64
from playwright.async_api import async_playwright
logo = base64.b64encode(open('src/logo.png','rb').read()).decode()
font = base64.b64encode(open('src/inter.woff2','rb').read()).decode()
T = {
 'de': ('KI-Agentur für KMU in Zürich und im Limmattal', 'Apps, Websites und Werbung.', 'Fixpreis. Fixtermin.', 'Website ab CHF 1’900 · App ab CHF 9’800 · Ads ab CHF 590/Mt.'),
 'en': ('AI agency for small businesses in Zurich', 'Apps, websites and ads.', 'Fixed price. Fixed date.', 'Website from CHF 1’900 · App from CHF 9’800 · Ads from CHF 590/mo'),
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1200,'height':630})
        for lang,(eb,l1,l2,price) in T.items():
            await pg.set_content(f'''<style>@font-face{{font-family:I;src:url(data:font/woff2;base64,{font}) format('woff2');font-weight:100 900}}
            body{{margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 75% 115%,#0a2a5c 0%,#000 60%);color:#f5f5f7;font-family:I,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;box-sizing:border-box}}
            .b{{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:600;letter-spacing:-.02em}} .b img{{width:56px;height:56px;border-radius:14px}}
            small{{display:block;color:#2997ff;font-size:28px;font-weight:600;margin-bottom:18px}}
            h1{{margin:0;font-size:84px;line-height:1.02;letter-spacing:-.045em;font-weight:700}} h1 span{{color:#a1a1a6}}
            p{{margin:0;font-size:28px;color:#d2d2d7}}</style>
            <div class="b"><img src="data:image/png;base64,{logo}">VincialMedia</div>
            <div><small>{eb}</small><h1>{l1}<br><span>{l2}</span></h1></div><p>{price} · Schlieren ZH</p>''')
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'src/og-{lang}.png')
        await b.close()
asyncio.run(main())

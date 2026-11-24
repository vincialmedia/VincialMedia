// Static site generator for vincialmedia.com.
// Reads the copy (content.js), writes finished HTML per page and language, hashed assets, sitemap, robots and llms.txt.
// Output goes to out/, which sync.sh copies into the Next.js app one folder up.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import * as esbuild from 'esbuild';
import { PRICE, MONTHLY, RECUR, ORDER, SVCS, SVCPAGE, esc, fmt, priceText, url, chipsHtml, rowsHtml, totals } from './src/shared.js';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = p => path.join(ROOT, 'src', p);
const OUT = path.join(ROOT, 'out');
const ORIGIN = 'https://www.vincialmedia.com';
/* lastmod per page: the date a page's content last changed, remembered in lastmod.json between builds */
const NOW = new Date(), TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`;
const MODFILE = path.join(ROOT, 'lastmod.json'), MOD = fs.existsSync(MODFILE) ? JSON.parse(fs.readFileSync(MODFILE, 'utf8')) : {};
const PHONE = '';   // public phone number in international form, e.g. '+41 44 000 00 00'. Empty: no number is shown anywhere.
const GSV = 'RxrhpDdeCiLf75Rizc6_TtQwKls1UCBaUVUGbqtKq8g';

fs.rmSync(OUT, { recursive: true, force: true });
const outPub = p => { const f = path.join(OUT, 'public', p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const asset = (name, buf) => { const ext = path.extname(name), file = `assets/${path.basename(name, ext)}.${hash(buf)}${ext}`; fs.writeFileSync(outPub(file), buf); return '/' + file; };

/* ---------- copy ---------- */
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(SRC('content.js'), 'utf8'), ctx);
const C = ctx.window.C;
const SLUGS = Object.keys(C.de.pages), DOCS = Object.keys(C.de.docs);
const LOCAL = SLUGS.filter(s => s.startsWith('webdesign-')), SERVICE = SLUGS.filter(s => !LOCAL.includes(s));
const LANGS = ['de', 'en'];

/* ---------- assets ---------- */
const appJs = (await esbuild.build({ entryPoints: [SRC('app.js')], bundle: true, minify: true, format: 'iife', target: ['es2019'], write: false })).outputFiles[0].contents;
const APP = asset('app.js', Buffer.from(appJs));
const threeJs = (await esbuild.build({ entryPoints: [SRC('three-entry.js')], bundle: true, minify: true, format: 'iife', target: ['es2019'], write: false, treeShaking: true })).outputFiles[0].text;
const sceneJs = (await esbuild.transform(fs.readFileSync(SRC('scene.js'), 'utf8'), { minify: true, target: 'es2019' })).code;
const SCENE = asset('scene.js', Buffer.from(threeJs + '\n' + sceneJs));
const FONT = asset('inter.woff2', fs.readFileSync(SRC('inter.woff2')));
const LOGO = asset('logo.png', fs.readFileSync(SRC('logo.png')));
const LOGO96 = asset('logo-96.png', fs.readFileSync(SRC('logo-96.png')));
const OG = { de: asset('og-de.png', fs.readFileSync(SRC('og-de.png'))), en: asset('og-en.png', fs.readFileSync(SRC('og-en.png'))) };
const PHOTO = fs.existsSync(SRC('vincent.jpg')) ? asset('vincent.jpg', fs.readFileSync(SRC('vincent.jpg'))) : '';
/* still images of the 3D scenes, rendered by tests/posters.py: <shot>-<lang>-w (16:9), -t (small screens), -p (phone, 4:7) */
const VIS = {};
if (fs.existsSync(SRC('vis'))) for (const f of fs.readdirSync(SRC('vis')).filter(f => f.endsWith('.webp'))) VIS[f.replace('.webp', '')] = asset(f, fs.readFileSync(SRC('vis/' + f)));
for (const f of ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png']) fs.copyFileSync(SRC(f), outPub(f));
const CSS = (await esbuild.transform(fs.readFileSync(SRC('styles.css'), 'utf8').replace('url(inter.woff2)', `url(${FONT})`), { loader: 'css', minify: true })).code.trim();

/* ---------- helpers ---------- */
const st = i => ` style="--i:${i}"`;
const abs = p => ORIGIN + (p === '/' ? '/' : p);
const finderData = T => ({ finder: T.finder, lv: T.lv, form: T.finder.form, tiers: Object.fromEntries(SVCS.map(k => [k, T.pages[SVCPAGE[k]].tiers])) });
const navOf = (T, s) => (T.pages[s] || T.docs[s]).nav;
const linkify = (text, word, href) => { const i = text.lastIndexOf(word); return i < 0 ? esc(text) : esc(text.slice(0, i)) + `<a href="${href}">${esc(word)}</a>` + esc(text.slice(i + word.length)); };
const rich = s => esc(s).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, m => `<a href="mailto:${m}">${m}</a>`);
const faqHtml = (T, lang, items, pre) => items.map((q, i) => `<div class="q"${st(i)}><h3><button type="button" aria-expanded="false" aria-controls="${pre}a${i}" id="${pre}q${i}">${esc(q[0])}<i aria-hidden="true"></i></button></h3><div class="ans" id="${pre}a${i}" role="region" aria-labelledby="${pre}q${i}"><p>${esc(q[1])}</p>${q[2] ? `<a href="${url(q[2], lang)}">${esc(navOf(T, q[2]))} ›</a>` : ''}</div></div>`).join('');
const stepsHtml = T => T.how.steps.map((s, i) => `<li${st(i)}><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p></li>`).join('');
const tiles = a => a.map((f, i) => `<div${st(i)}><b class="roll"><i data-v="${esc(f[0])}"${st(i)}>${esc(f[0])}</i></b><span>${esc(f[1])}</span></div>`).join('');
const tierCards = (T, k) => `<div class="tg sg">${ORDER.map((s, i) => { const lv = T.lv[k][i]; return `<article class="tc"${st(i)}><h3>${esc(T.finder.size[s])}</h3><b>${esc(priceText(T, k, i))}</b><span>${esc(T.finder.time[k][i])}</span><p>${esc(lv.f)}</p><ul>${lv.inc.map(x => `<li>${esc(x)}</li>`).join('')}</ul></article>`; }).join('')}</div>`;
const tab = (cols, rows, cls) => `<table class="ptab${cls || ''}"><thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td data-l="${esc(cols[i])}">${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table>`;

/* ---------- structured data ---------- */
function graph(T, lang, view, mod) {
  const p = view === 'home' ? null : (T.pages[view] || T.docs[view]), en = lang === 'en';
  const here = abs(url(view, lang)), ME = ORIGIN + '/#vincent', CAT = abs(url('preise', lang)) + '#catalog', per = en ? 'per month' : 'pro Monat';
  const org = { '@type': 'ProfessionalService', '@id': ORIGIN + '/#org', name: 'VincialMedia', url: ORIGIN + '/', logo: ORIGIN + LOGO, image: ORIGIN + OG[lang], description: T.meta.desc, email: 'vincent@vincialmedia.com', ...(PHONE ? { telephone: PHONE.replace(/\s/g, '') } : {}), priceRange: 'CHF 590–39’000', founder: { '@id': ME }, address: { '@type': 'PostalAddress', streetAddress: 'Brandstrasse 21', addressLocality: 'Schlieren', postalCode: '8952', addressRegion: 'ZH', addressCountry: 'CH' }, areaServed: [...['Zürich', 'Schlieren', 'Dietikon', 'Urdorf'].map(n => ({ '@type': 'City', name: n })), { '@type': 'Place', name: 'Limmattal' }], knowsLanguage: ['de', 'en'], hasOfferCatalog: { '@id': CAT } };
  const me = { '@type': 'Person', '@id': ME, name: 'Vincent Hänggi', jobTitle: en ? 'Founder' : 'Inhaber', worksFor: { '@id': ORIGIN + '/#org' }, url: ORIGIN + '/', ...(PHOTO ? { image: ORIGIN + PHOTO } : {}), knowsAbout: ['CRM', 'Marketing Automation', 'Webdesign', 'App-Entwicklung', 'Google Ads', 'KI-Automation'] };
  /* a monthly price is marked as monthly; the AI assistant has a setup price plus a monthly running price */
  const offer = (k, i, extra) => {
    const o = { '@type': 'Offer', name: T.finder.svc[k] + ' ' + T.finder.size[ORDER[i]], price: PRICE[k][i], priceCurrency: 'CHF', ...extra };
    if (RECUR[k]) o.priceSpecification = { '@type': 'UnitPriceSpecification', price: PRICE[k][i], priceCurrency: 'CHF', unitCode: 'MON', unitText: per };
    else if (MONTHLY[k]) o.priceSpecification = { '@type': 'CompoundPriceSpecification', priceCurrency: 'CHF', priceComponent: [{ '@type': 'UnitPriceSpecification', name: en ? 'Setup, one-off' : 'Einrichtung, einmalig', price: PRICE[k][i], priceCurrency: 'CHF' }, { '@type': 'UnitPriceSpecification', name: en ? 'Running it' : 'Betrieb', price: MONTHLY[k][i], priceCurrency: 'CHF', unitCode: 'MON', unitText: per }] };
    return o;
  };
  const faq = items => ({ '@type': 'FAQPage', mainEntity: items.map(q => ({ '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) });
  const trail = p ? [['home', T.nav.home], ...(LOCAL.includes(view) ? [['webdesign', T.pages.webdesign.nav]] : []), [view, p.nav]] : [];
  const crumbs = () => ({ '@type': 'BreadcrumbList', '@id': here + '#crumbs', itemListElement: trail.map(([v, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: abs(url(v, lang)) })) });
  const page = { '@type': 'WebPage', '@id': here + '#page', url: here, name: p ? p.title : T.meta.title, description: p ? p.desc : T.meta.desc, inLanguage: en ? 'en' : 'de-CH', isPartOf: { '@id': ORIGIN + '/#site' }, about: { '@id': ORIGIN + '/#org' }, author: { '@id': ME }, dateModified: mod, ...(p ? { breadcrumb: { '@id': here + '#crumbs' } } : {}) };
  const g = [org, me, page];
  if (!p) g.push({ '@type': 'WebSite', '@id': ORIGIN + '/#site', url: ORIGIN + '/', name: 'VincialMedia', inLanguage: ['de-CH', 'en'], publisher: { '@id': ORIGIN + '/#org' } }, faq(T.faq.items));
  else if (p.svc) g.push(crumbs(), { '@type': 'Service', name: p.h1, description: p.lead, serviceType: T.finder.svc[p.svc], provider: { '@id': ORIGIN + '/#org' }, areaServed: LOCAL.includes(view) ? { '@type': 'City', name: p.nav.split(' ').pop() } : { '@type': 'City', name: 'Zürich' }, offers: ORDER.map((s, i) => offer(p.svc, i, { description: `${T.lv[p.svc][i].f} ${priceText(T, p.svc, i)}.` })) }, faq(p.faq));
  else if (p.faq) g.push(crumbs(), { '@type': 'OfferCatalog', '@id': CAT, name: (en ? 'VincialMedia price list ' : 'Preisliste VincialMedia ') + mod.slice(0, 4), itemListElement: SVCS.flatMap(k => ORDER.map((sz, i) => offer(k, i, { description: `${T.lv[k][i].f} ${T.lv[k][i].inc.join('. ')}. ${priceText(T, k, i)}.`, itemOffered: { '@type': 'Service', name: T.finder.svc[k] } }))) }, faq(p.faq));
  else g.push(crumbs());
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': g }).replace(/</g, '\\u003c');
}

/* the device sits beside the text on wide screens and behind it on narrow or tall ones; app.js uses the same query */
const SIDE = '(min-width:900px) and (min-aspect-ratio:21/20)', CENTER = '(max-width:899px), (max-aspect-ratio:21/20)';
const sceneData = T => `<script id="sd" type="application/json">${JSON.stringify(T.scene).replace(/</g, '\\u003c')}</script>`;

/* ---------- page parts ---------- */
function head(T, lang, view, mod) {
  const p = view === 'home' ? null : (T.pages[view] || T.docs[view]);
  const title = p ? p.title : T.meta.title, desc = p ? p.desc : T.meta.desc, here = url(view, lang);
  const shot = p && p.svc ? (LOCAL.includes(view) ? 'local' : p.svc) : '', poster = shot ? VIS[`${shot}-${lang}-w`] : '';
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'de-CH'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${abs(here)}">
<link rel="alternate" hreflang="de-CH" href="${abs(url(view, 'de'))}">
<link rel="alternate" hreflang="en" href="${abs(url(view, 'en'))}">
<link rel="alternate" hreflang="x-default" href="${abs(url(view, 'de'))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VincialMedia">
<meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'de_CH'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${abs(here)}">
<meta property="og:image" content="${ORIGIN + OG[lang]}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#000000">
${view === 'home' ? `<meta name="google-site-verification" content="${GSV}">\n` : ''}<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="${FONT}" as="font" type="font/woff2" crossorigin>${poster ? `\n<link rel="preload" as="image" href="${poster}" media="${SIDE}">` : ''}
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__vm)document.documentElement.classList.remove('js')},4000)</script>
<style>${CSS}</style>
<script type="application/ld+json">${graph(T, lang, view, mod)}</script>
<script src="${APP}" defer></script>
</head>`;
}

function header(T, lang, view) {
  const other = lang === 'de' ? 'en' : 'de';
  const cta = view === 'home' ? '#finder' : url('home', lang) + '#finder';
  return `<a class="skip" href="#main">${lang === 'en' ? 'Skip to content' : 'Zum Inhalt'}</a>
<header class="top" id="top">
 <div class="wrap">
  <a class="logo" href="${url('home', lang)}" aria-label="VincialMedia ${esc(T.nav.home)}"><span class="star" id="star" aria-hidden="true"><img src="${LOGO96}" alt="" width="26" height="26"></span>VincialMedia</a>
  <button class="burger" id="burger" aria-expanded="false" aria-controls="nav" aria-label="${esc(T.nav.menu)}"><span></span><span></span></button>
  <nav class="nav" id="nav" aria-label="${lang === 'en' ? 'Main' : 'Hauptmenü'}">
   ${[['app-entwicklung', T.nav.apps], ['webdesign', T.nav.web], ['google-ads', T.nav.ads], ['ki-automation', T.nav.auto], ['preise', T.nav.price]].map(([s, l]) => `<a href="${url(s, lang)}"${s === view ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}
   <a class="langb" href="${url(view, other)}" hreflang="${other}" lang="${other}" aria-label="${other === 'en' ? 'EN, English version' : 'DE, Deutsche Version'}">${other.toUpperCase()}</a>
   <a class="pill" href="${cta}">${esc(T.nav.cta)}</a>
  </nav>
 </div>
</header>`;
}

function footer(T, lang, view) {
  const cta = view === 'home' ? '#finder' : url('home', lang) + '#finder';
  const links = a => a.map(s => `<a href="${url(s, lang)}">${esc(navOf(T, s))}</a>`).join('');
  return `<footer>
 <div class="wrap">
  <div class="fbrand"><img src="${LOGO96}" width="44" height="44" alt="VincialMedia Logo" loading="lazy"><div><strong>VincialMedia</strong><p>${esc(T.foot.tag)}</p></div></div>
  <nav class="links" aria-label="Footer">
   <div><strong>${esc(T.foot.c1)}</strong><span class="fl">${links([...SERVICE, 'preise'])}</span></div>
   <div><strong>${esc(T.foot.c2)}</strong><span class="fl">${links(LOCAL)}</span></div>
   <div><strong>${esc(T.foot.c3)}</strong><span>VincialMedia, ${esc(T.foot.addr)}</span>${PHONE ? `<a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a>` : ''}<a href="mailto:vincent@vincialmedia.com">vincent@vincialmedia.com</a><a href="${cta}">${esc(T.nav.cta)}</a></div>
  </nav>
  <div class="legal"><span>© 2026 VincialMedia</span><span class="lg"><span id="f3">${links(['impressum', 'datenschutz'])}</span><button type="button" class="cset" id="cset">${esc(T.consent.settings)}</button></span><span class="lng">${LANGS.map(l => `<a href="${url(view, l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('·')}</span></div>
 </div>
</footer>
<div class="cb" id="cb" role="region" aria-label="Cookies" hidden>
 <p><span>${esc(T.consent.text)}</span> <a href="${url('datenschutz', lang)}">${esc(T.consent.more)}</a></p>
 <div><button type="button" id="cno">${esc(T.consent.no)}</button><button type="button" id="cyes">${esc(T.consent.yes)}</button></div>
</div>`;
}

function home(T, lang) {
  const F = finderData(T), sel = { web: 's' }, t = totals(F, sel), f = T.finder, fm = f.form, pk = T.pk;
  const privacy = lang === 'en' ? 'privacy policy' : 'Datenschutz', once = lang === 'en' ? 'one-off' : 'einmalig';
  const csW = VIS['case-w'], csT = VIS['case-t'];
  return `<div id="home">
 <section class="scene" id="scene" data-src="${SCENE}">
  <div class="stage" id="stage">
   <canvas id="gl" aria-hidden="true"></canvas>
   <div class="scrim" id="scrim"></div>
   <div class="herocopy" id="herocopy">
    <h1 class="in"><small>${esc(T.hero.eyebrow)}</small> <span>${esc(T.hero.l1)}</span> <span>${esc(T.hero.l2)}</span></h1>
    <p class="sub in d2">${esc(T.hero.sub)}</p>
    <div class="ctas in d3"><a class="pill" href="#finder">${esc(T.hero.cta)}</a><a href="#packages">${esc(T.hero.link)}</a></div>
   </div>
   ${T.caps.map(c => `<div class="cap"><small>${esc(c.k)}</small><h2>${esc(c.h)}</h2><p>${esc(c.p)}</p></div>`).join('\n   ')}
   <a class="skipf" href="#finder">${esc(T.hero.skip)}</a>
   <div class="hint" id="hint">${esc(T.hero.hint)}</div>
  </div>
 </section>

 <div class="mq" aria-hidden="true"><div id="mq">${Array(4).fill(`<span><b>${esc(T.mq[0])}</b> · ${T.mq.slice(1).map(esc).join(' · ')} ·</span>`).join('')}</div></div>

 <section class="band wrap" id="finder">
  <div class="head rv"><div><h2>${esc(f.h)}</h2><p>${esc(f.p)}</p></div></div>
  <div class="finder rv">
   <div class="box">
    <fieldset><legend>${esc(f.l1)}</legend><div class="chips" id="svc">${chipsHtml(F, sel)}</div></fieldset>
    <p class="leg">${esc(f.l2)}</p>
    <div id="rows">${rowsHtml(F, sel)}</div>
   </div>
   <div class="plan" id="plan" aria-live="polite">
    <small>${esc(f.plan)}</small>
    <ul class="lines" id="lines">${t.html}</ul>
    <div class="tot" id="tot">
     <div id="t1r"${t.once ? '' : ' hidden'}><span>${esc(f.once)}</span><strong id="t1">${fmt(t.once)}</strong></div>
     <div id="t2r"${t.month ? '' : ' hidden'}><span>${esc(f.monthly)}</span><strong id="t2">${fmt(t.month)}</strong></div>
    </div>
    <button type="button" class="go" id="go">${esc(f.go)}</button>
    <form class="qf" id="qf" hidden novalidate>
     <div class="qg">
      <label><span>${esc(fm.name)}</span><input name="name" autocomplete="name" maxlength="100" required aria-describedby="e-name" placeholder="${esc(fm.phName)}"><span class="fe" id="e-name" role="alert" hidden></span></label>
      <label><span>${esc(fm.email)}</span><input name="email" type="email" autocomplete="email" maxlength="200" required aria-describedby="e-email" placeholder="${esc(fm.ph)}"><span class="fe" id="e-email" role="alert" hidden></span></label>
      <label><span>${esc(fm.phone)} <small>(${esc(fm.opt)})</small></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      <label><span>${esc(fm.msg)} <small>(${esc(fm.opt)})</small></span><textarea name="msg" rows="3" maxlength="2000" placeholder="${esc(fm.phMsg)}"></textarea></label>
     </div>
     <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
     <button type="submit">${esc(fm.send)}</button>
     <p class="qnote">${linkify(fm.note, privacy, url('datenschutz', lang))}</p>
     <p class="done" id="qdone" role="status" tabindex="-1" hidden></p>
     <p class="qerr" id="qerr" role="alert" hidden></p>
    </form>
    <button type="button" class="again" id="qagain" hidden>${esc(fm.again)}</button>
   </div>
  </div>
  <p class="note">${esc(f.note)}</p>
 </section>

 <section class="band wrap" id="packages">
  <div class="head rv"><div><h2>${esc(pk.h)}</h2><p>${esc(pk.p)}</p></div><a href="#finder">${esc(pk.link)}</a></div>
  <div class="cards" id="cards">${pk.cards.map((c, i) => `<a href="${url(c.slug, lang)}" class="card rv" style="transition-delay:${i * 90}ms"><small>${esc(c.k)}</small><h3>${esc(c.t)}</h3><ul>${c.li.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="pr"><b><small>${esc(c.unit.split(', ')[0])}</small>${esc(c.price)}</b>${esc(c.unit.split(', ')[1] || once)}</div><span class="ml">${esc(pk.more)}</span></a>`).join('')}</div>
 </section>

 <section class="band wrap" id="why">
  <div class="who rv">
   <div><h2>${esc(T.why.h)}</h2><p>${esc(T.why.p1)}</p><p>${esc(T.why.p2)}</p><a class="tl" href="${url('preise', lang)}">${esc(T.why.link)}</a></div>
   <div class="wf price sg" id="pf">${tiles(T.why.facts)}</div>
  </div>
 </section>

 <section class="band wrap" id="who">
  <div class="who rv">
   <div><h2>${esc(T.who.h)}</h2>${PHOTO ? `<div class="me"><img src="${PHOTO}" width="84" height="84" alt="${esc(T.who.alt)}" loading="lazy" decoding="async"><div><strong>Vincent Hänggi</strong><span>${esc(T.who.role)}</span></div></div>` : ''}<p>${esc(T.who.p1)}</p><p>${esc(T.who.p2)}</p></div>
   <div class="wf sg" id="wf">${tiles(T.who.facts)}</div>
  </div>
 </section>

 ${csW ? `<section class="band wrap" id="case">
  <div class="cs rv">
   <div><small>${esc(T.cs.k)}</small><h2>${esc(T.cs.h)}</h2><p>${esc(T.cs.p)}</p><a class="tl" href="https://www.buyauto.ch/" target="_blank" rel="noopener">${esc(T.cs.link)} ›</a></div>
   <div class="csv"><picture>${csT ? `<source media="(max-width:699px)" srcset="${csT}" width="900" height="720">` : ''}<img src="${csW}" width="1600" height="900" alt="${esc(T.cs.alt)}" loading="lazy" decoding="async"></picture></div>
  </div>
 </section>

 ` : ''}<section class="band wrap" id="how">
  <div class="head rv"><h2>${esc(T.how.h)}</h2></div>
  <ol class="steps rv sg" id="steps">${stepsHtml(T)}</ol>
 </section>

 <section class="band wrap" id="faq">
  <div class="head rv"><h2>${esc(T.faq.h)}</h2></div>
  <div class="faq rv sg" id="faqlist">${faqHtml(T, lang, T.faq.items, 'h')}</div>
 </section>

 <section class="band wrap cta rv" id="cta">
  <h2>${esc(T.cta.h)}</h2>
  <a class="pill big" href="#finder">${esc(T.cta.b)}</a>
 </section>
</div>
<script id="fd" type="application/json">${JSON.stringify(F).replace(/</g, '\\u003c')}</script>
${sceneData(T)}`;
}

function servicePage(T, lang, slug) {
  const p = T.pages[slug], H = url('home', lang), cta = `${H}?svc=${p.svc}#finder`;
  const local = LOCAL.includes(slug), shot = local ? 'local' : p.svc, v = T.vis[shot], W = VIS[`${shot}-${lang}-w`], P = VIS[`${shot}-${lang}-p`];
  const facts = `<dl class="facts rg">${p.facts.map((f, i) => `<div><dt>${esc(f[0])}</dt><dd class="roll"><i data-v="${esc(f[1])}"${st(i)}>${esc(f[1])}</i></dd></div>`).join('')}</dl>`;
  const tr = shot === 'auto' ? `<details class="tr gc"><summary>${esc(v.tr)}</summary><ol>${T.scene.chat.msgs.map(m => `<li><b>${esc(v.who[m[0]])}:</b> ${esc(m[1])}</li>`).join('')}${T.scene.chat.done.map(d => `<li>${esc(d)}</li>`).join('')}</ol></details>` : '';
  const region = slug === 'webdesign' ? `<section class="rv"><h2>${esc(T.page.region)}</h2><p>${esc(T.page.regionP)}</p><div class="more region">${LOCAL.map(s2 => `<a href="${url(s2, lang)}">${esc(navOf(T, s2))}</a>`).join('')}</div></section>\n  ` : '';
  const prices = LOCAL.includes(slug)
    ? `<table class="tiers"><thead><tr>${T.page.cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${ORDER.map((k, i) => `<tr><td>${esc(T.finder.size[k])}</td><td>${esc(p.tiers[i])}</td><td>${esc(T.finder.time[p.svc][i])}</td><td>${esc(priceText(T, p.svc, i))}</td></tr>`).join('')}</tbody></table><a class="tl" href="${url('preise', lang)}">${esc(T.lv.all)}</a>`
    : tierCards(T, p.svc);
  /* the 3D device is a pinned background (a still image until the live scene has loaded); the text scrolls over it */
  return `<article id="page">
 <section class="sv" id="sv" data-src="${SCENE}">
  <div class="svbg">
   ${W ? `<picture>${P ? `<source media="${CENTER}" srcset="${P}" width="800" height="1400">` : ''}<img src="${W}" width="1600" height="900" alt="${esc(v.alt)}" decoding="async"></picture>` : ''}
   <canvas data-shot="${shot}" aria-hidden="true"></canvas>
   <p class="svtag"><b>${esc(T.vis.tag)}</b><span>${esc(v.cap)}${v.cap2 ? ` <span class="dk">${esc(v.cap2)}</span>` : ''}</span></p>
  </div>
  <div class="svfg wrap">
   <div class="svhero">
    <nav class="crumb in" aria-label="Breadcrumb"><a href="${H}">${esc(T.nav.home)}</a> › ${local ? `<a href="${url('webdesign', lang)}">${esc(T.pages.webdesign.nav)}</a> › ` : ''}${esc(p.nav)}</nav>
    <h1 class="in">${esc(p.h1)}</h1>
    <p class="lead in d2">${esc(p.lead)}</p>
    <p class="by in d2">${esc(T.page.by)}</p>
    <a class="pill big ctop in d3" href="${cta}">${esc(T.nav.cta)}</a>
   </div>
   <div class="gc gf rv">${facts}</div>
   <h2 class="svh rv">${esc(T.page.inc)}</h2>
   ${p.inc.map(x => `<div class="gc rv"><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div>`).join('\n   ')}
   ${tr}
  </div>
 </section>
 <div class="pg wrap">
  <section class="rv"><h2>${esc(T.page.tiers)}</h2>${prices}</section>
  <section class="honest rv"><h2>${esc(p.honest[0])}</h2><p>${esc(p.honest[1])}</p></section>
  <section class="rv"><h2>${esc(T.how.h)}</h2><ol class="steps sg">${stepsHtml(T)}</ol></section>
  <section class="rv"><h2>${esc(T.page.faq)}</h2><div class="faq sg">${faqHtml(T, lang, p.faq, 'p')}</div></section>
  ${region}<section class="rv"><h2>${esc(T.page.more)}</h2><div class="more">${[...SLUGS.filter(s => s !== slug), 'preise'].map(s => `<a href="${url(s, lang)}">${esc(navOf(T, s))}</a>`).join('')}</div></section>
  <section class="cta rv"><h2>${esc(T.page.cta)}</h2><a class="pill big" href="${cta}">${esc(T.nav.cta)}</a></section>
 </div>
</article>
${sceneData(T)}`;
}

function docPage(T, lang, slug) {
  const d = T.docs[slug], f = T.finder, H = url('home', lang);
  const prices = () => tab([T.page.svc, ...ORDER.map(s => f.size[s])], SVCS.map(k => [`<a href="${url(SVCPAGE[k], lang)}">${esc(f.svc[k])}</a>`, ...ORDER.map((s, i) => esc(priceText(T, k, i)))]));
  const top = [
    `<nav class="crumb" aria-label="Breadcrumb"><a href="${H}">${esc(T.nav.home)}</a> › ${esc(d.nav)}</nav>`,
    `<h1>${esc(d.h1)}</h1>`, `<p class="lead">${esc(d.lead)}</p>`, `<p class="by">${esc(T.page.by)}</p>`
  ].map((h, i) => h.replace(/^<(\w+)/, `<$1${st(i)}`));
  return `<article id="page"><div class="pg wrap doc enter">
  ${top.join('\n  ')}
  ${d.sections.map(s => `<section class="rv"${s.tiers ? ` id="lv-${s.tiers}"` : ''}><h2>${esc(s.h)}</h2>${s.prices ? prices() : ''}${s.tiers ? tierCards(T, s.tiers) : ''}${s.table ? tab(s.table.cols, s.table.rows.map(r => r.map(esc)), slug === 'preise' ? ' mk' : '') : ''}${(s.p || []).map(x => `<p>${rich(x)}</p>`).join('')}${s.list ? `<ul>${s.list.map(x => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}${s.prices ? `<div class="jump"><span>${esc(T.lv.jump)}</span>${SVCS.map(k => `<button type="button" class="chip sm" data-jump="lv-${k}">${esc(f.svc[k])}</button>`).join('')}</div>` : ''}</section>`).join('\n  ')}
  ${d.faq ? `<section class="rv"><h2>${esc(T.page.faq)}</h2><div class="faq sg">${faqHtml(T, lang, d.faq, 'p')}</div></section>` : ''}
  ${d.sources ? `<section class="rv"><h2>${esc(T.page.src)}</h2><ul class="src">${d.sources.map(s => `<li><a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a></li>`).join('')}</ul></section>` : ''}
  ${d.faq ? `<section class="cta rv"><h2>${esc(T.page.cta)}</h2><a class="pill big" href="${H}#finder">${esc(T.nav.cta)}</a></section>` : '<div class="end"></div>'}
 </div></article>`;
}

/* ---------- write pages ---------- */
const pages = [];
for (const lang of LANGS) {
  const T = C[lang];
  for (const view of ['home', ...SLUGS, ...DOCS]) {
    const body = view === 'home' ? home(T, lang) : SLUGS.includes(view) ? servicePage(T, lang, view) : docPage(T, lang, view);
    const id = `${lang}/${view}`, h = hash(Buffer.from(body.replace(/\/assets\/([\w-]+)\.[0-9a-f]{10}\./g, '/assets/$1.')));
    if (!MOD[id] || MOD[id].h !== h) MOD[id] = { h, d: TODAY };
    const htmlOut = `${head(T, lang, view, MOD[id].d)}\n<body>\n${header(T, lang, view)}\n<main id="main">\n${body}\n</main>\n${footer(T, lang, view)}\n</body>\n</html>\n`;
    const file = `site/${lang}/${view === 'home' ? 'index' : view}.html`;
    fs.writeFileSync(outPub(file), htmlOut);
    pages.push({ lang, view, file, path: url(view, lang), bytes: Buffer.byteLength(htmlOut) });
  }
}
fs.writeFileSync(MODFILE, JSON.stringify(Object.fromEntries(Object.keys(MOD).sort().map(k => [k, MOD[k]])), null, 1) + '\n');
const LATEST = Object.values(MOD).map(m => m.d).sort().pop();

/* ---------- routing for Next.js (rewrites from clean URLs to the static files) ---------- */
const slugRe = [...SLUGS, ...DOCS].join('|');
const rewrites = [
  { source: '/', destination: '/site/de/index.html' },
  { source: `/:slug(${slugRe})`, destination: '/site/de/:slug.html' },
  { source: '/en', destination: '/site/en/index.html' },
  { source: `/en/:slug(${slugRe})`, destination: '/site/en/:slug.html' }
];
fs.writeFileSync(path.join(OUT, 'rewrites.json'), JSON.stringify(rewrites, null, 1));

/* ---------- sitemap, robots, llms.txt ---------- */
const views = ['home', ...SLUGS, ...DOCS];
const prio = v => v === 'home' ? '1.0' : v === 'preise' ? '0.9' : SLUGS.includes(v) ? '0.8' : '0.3';
fs.writeFileSync(outPub('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.flatMap(lang => views.map(v => `<url><loc>${abs(url(v, lang))}</loc><lastmod>${MOD[`${lang}/${v}`].d}</lastmod><priority>${prio(v)}</priority><xhtml:link rel="alternate" hreflang="de-CH" href="${abs(url(v, 'de'))}"/><xhtml:link rel="alternate" hreflang="en" href="${abs(url(v, 'en'))}"/><xhtml:link rel="alternate" hreflang="x-default" href="${abs(url(v, 'de'))}"/></url>`)).join('\n')}
</urlset>
`);
fs.writeFileSync(outPub('robots.txt'), `# vincialmedia.com
User-agent: *
Allow: /
Disallow: /api/
Disallow: /site/

# Search and answer engines are welcome
User-agent: Googlebot
User-agent: Bingbot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
Allow: /
Disallow: /api/
Disallow: /site/

Sitemap: ${ORIGIN}/sitemap.xml
`);
const D = C.de, E = C.en;
const priceLines = T => SVCS.map(k => `- ${T.finder.svc[k]}: ${ORDER.map((s, i) => `${T.finder.size[s]} ${priceText(T, k, i)}`).join(', ')}. ${ORIGIN}${url(SVCPAGE[k], T === E ? 'en' : 'de')}`).join('\n');
fs.writeFileSync(outPub('llms.txt'), `# VincialMedia

> KI-Agentur für KMU in Zürich und im Limmattal. Apps, Websites, Google und Meta Ads und KI-Automation zum Fixpreis. Einzelfirma von Vincent Hänggi, Brandstrasse 21, 8952 Schlieren. Kontakt: vincent@vincialmedia.com

${D.who.p1} ${D.why.p2}

## Preise (CHF, Fixpreise, VincialMedia ist nicht MWST-pflichtig, Stand ${LATEST})
${priceLines(D)}

Konditionen: Hosting und Domain sind bei Websites im ersten Jahr inbegriffen, danach CHF 25 pro Monat. Zahlung je zur Hälfte bei Auftrag und bei Livegang. Monatliche Leistungen sind auf Ende Monat kündbar. Offerte innert zwei Arbeitstagen.

Marktvergleich: Schweizer Agenturen verlangen für eine KMU-Website CHF 5’000 bis 15’000, der Median öffentlicher Fixpreis-Pakete liegt bei CHF 2’500. Quellen:
${D.docs.preise.sources.map(x => `- [${x[0]}](${x[1]})`).join('\n')}

## Seiten
- [Startseite](${ORIGIN}/): Übersicht, Paket-Konfigurator, Offertanfrage
- [Preise](${ORIGIN}/preise): alle Preise, was jede Stufe enthält, Marktvergleich mit Quellen
${SLUGS.map(s => `- [${D.pages[s].h1}](${ORIGIN}/${s}): ${D.pages[s].desc}`).join('\n')}
- [Impressum](${ORIGIN}/impressum)
- [Datenschutz](${ORIGIN}/datenschutz)

## English
> ${E.meta.desc}

Services: websites, apps, Google and Meta ads, and AI automation (an assistant that answers enquiries on WhatsApp and email, plus CRM setup). Fixed prices in CHF, VincialMedia is not liable for VAT. Website packages include hosting and domain in year one, then CHF 25 a month. Half is paid on order, half at launch.

${priceLines(E)}

- [Home](${ORIGIN}/en)
- [Prices](${ORIGIN}/en/preise)
${SLUGS.map(s => `- [${E.pages[s].h1}](${ORIGIN}/en/${s})`).join('\n')}
`);

/* ---------- report ---------- */
const sizes = Object.fromEntries(fs.readdirSync(path.join(OUT, 'public/assets')).map(f => [f, fs.statSync(path.join(OUT, 'public/assets', f)).size]));
console.log(JSON.stringify({ pages: pages.length, html: pages.map(p => `${p.path} ${(p.bytes / 1024).toFixed(1)}k`), assets: sizes, cssKB: (CSS.length / 1024).toFixed(1) }, null, 1));

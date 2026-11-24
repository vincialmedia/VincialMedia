// Browser runtime. Pages arrive fully rendered; this only adds behaviour and motion.
import { ORDER, SVCS, chipsHtml, rowsHtml, totals, fmt } from './shared.js';

const $ = id => document.getElementById(id);
const html = document.documentElement, lang = html.lang === 'en' ? 'en' : 'de';
/* false when the safety timer in <head> gave up on this script and showed the plain page */
const live = html.classList.contains('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* menu */
const burger = $('burger'), nav = $('nav');
const setMenu = o => { burger.setAttribute('aria-expanded', o); nav.classList.toggle('open', o); html.classList.toggle('menu', o); };
const closeMenu = () => setMenu(false);
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); burger.focus(); } });
matchMedia('(min-width:901px)').addEventListener('change', closeMenu);

/* FAQ accordion and in-page jumps */
document.addEventListener('click', e => {
  const b = e.target.closest('.q button');
  if (b) { const a = $(b.getAttribute('aria-controls')), open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open); a.style.height = open ? a.scrollHeight + 'px' : '0px'; return; }
  const j = e.target.closest('[data-jump]'), el = j && $(j.dataset.jump);
  if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
});

/* motion: sections rise in, groups stagger, facts roll up and count */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -8% 0px' });
function countUp(el) {
  const txt = el.dataset.v, m = txt.match(/\d[\d’]*/g);
  if (reduce || !m || m.length !== 1) return;
  const end = +m[0].replace(/’/g, ''), wait = parseFloat(getComputedStyle(el).transitionDelay) * 1000 || 0, dur = 1100;
  let t0 = 0;
  const step = now => { if (!t0) t0 = now + wait; const p = Math.min(1, Math.max(0, (now - t0) / dur)), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
    el.textContent = txt.replace(m[0], String(v).replace(/\B(?=(\d{3})+$)/g, '’')); if (p < 1) requestAnimationFrame(step); };
  el.textContent = txt.replace(m[0], '0'); requestAnimationFrame(step);
}
const sio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); e.target.querySelectorAll('i[data-v]').forEach(countUp); sio.unobserve(e.target); } }), { threshold: .2 });
document.querySelectorAll('.sg, .rg').forEach(g => { if (reduce) g.classList.add('vis'); else sio.observe(g); });
document.querySelectorAll('.rv').forEach(el => { if (reduce) el.classList.add('seen'); else io.observe(el); });

/* header shrinks on scroll; the logo twinkles in last, out on scroll and back in at the top */
const top = $('top'), star = $('star'); let starOn = false;
addEventListener('scroll', () => top.classList.toggle('small', scrollY > 40), { passive: true });
const twinkle = () => { const on = scrollY < 60; if (on === starOn) return; starOn = on; star.classList.toggle('on', on); star.classList.toggle('off', !on); };
const afterLoad = fn => { if (document.readyState === 'complete') fn(); else addEventListener('load', fn); };
afterLoad(() => setTimeout(() => { twinkle(); addEventListener('scroll', twinkle, { passive: true }); }, 1500));

/* Google Analytics only after a yes; the choice can be changed in the footer */
const GA_ID = 'G-K43H5KD1R1', cb = $('cb');
const consent = () => { try { return localStorage.getItem('vm-consent'); } catch (e) { return null; } };
function loadGA() {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date()); gtag('config', GA_ID);
  const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID; document.head.appendChild(s);
}
function dropGaCookies() {
  const host = location.hostname, parent = '.' + host.split('.').slice(-2).join('.');
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => n.startsWith('_ga')).forEach(n => [host, parent].forEach(d => { document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + d; }));
}
function setConsent(v) {
  const had = consent(); try { localStorage.setItem('vm-consent', v); } catch (e) {}
  cb.hidden = true;
  if (v === 'yes') loadGA(); else if (had === 'yes') { dropGaCookies(); location.reload(); }
}
$('cyes').addEventListener('click', () => setConsent('yes'));
$('cno').addEventListener('click', () => setConsent('no'));
$('cset').addEventListener('click', () => { cb.hidden = false; $('cno').focus(); });
if (consent() === 'yes') loadGA(); else if (!consent()) cb.hidden = false;
const track = (name, params) => { if (window.gtag) gtag('event', name, params || {}); };

/* 3D only where it runs well: a real GPU, no data saver, motion allowed. Everyone else keeps the still version. */
let weakMemo = null;
const weakGL = () => {
  if (weakMemo !== null) return weakMemo;
  if (/[?&]gl=1/.test(location.search)) return (weakMemo = false);
  if (!live || reduce || !window.WebGLRenderingContext || (navigator.connection && navigator.connection.saveData)) return (weakMemo = true);
  try {
    const g = document.createElement('canvas').getContext('webgl'); if (!g) return (weakMemo = true);
    const x = g.getExtension('WEBGL_debug_renderer_info'), r = x ? String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)) : '';
    const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    return (weakMemo = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r));
  } catch (e) { return (weakMemo = true); }
};
const loadScene = (src, fail) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onerror = fail; document.head.appendChild(s); };

/* service pages: the homepage's pinned stage. The intro fades out, then each caption appears, stays and leaves while the device stays put */
const sv = $('sv');
if (sv) {
  const stage = sv.querySelector('.stage'), hero = sv.querySelector('.svhero'), img = sv.querySelector('.svstill img'), scrim = sv.querySelector('.scrim'), hint = sv.querySelector('.hint');
  const caps = [...sv.querySelectorAll('.cap')], n = caps.length, FIRST = .13, STEP = (.985 - FIRST) / n;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1), ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  if (weakGL()) sv.classList.add('nogl');
  else {
    const sideMq = matchMedia('(min-width:900px) and (min-aspect-ratio:21/20)'), lay = { side: false, safe: .6 };
    /* side: on wide screens the device starts beside the intro. safe: where the intro ends (share of the screen height); on
       narrow screens the device starts below that line. Both end in the middle of the screen once the intro has gone. */
    const tall = /^(app|auto|ads)$/.test(sv.querySelector('canvas').dataset.shot) ? .58 : .39;
    const measure = () => { lay.side = sideMq.matches; lay.safe = clamp((hero.offsetHeight - 16) / stage.offsetHeight, .3, .86); };
    const prog = () => { const r = sv.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - stage.offsetHeight), 0, 1); };
    const dom = p => {
      const h = 1 - seg(p, .03, .11);
      hero.style.opacity = h; hero.style.transform = `translateY(${(h - 1) * 70}px)`; hero.style.pointerEvents = h < .5 ? 'none' : ''; hero.style.visibility = h <= 0 ? 'hidden' : '';
      hint.style.opacity = 1 - seg(p, 0, .03);
      let m = 0;
      caps.forEach((c, i) => { const a = FIRST + i * STEP, o = Math.min(seg(p, a, a + .035), i === n - 1 ? 1 : 1 - seg(p, a + STEP - .06, a + STEP - .025)); m = Math.max(m, o); c.style.opacity = o; c.style.transform = `translateY(${(1 - o) * 26}px)`; });
      scrim.style.opacity = m;
      stage.classList.toggle('deep', p > .1 && p < .985);
      /* until the live device has taken over, the still image follows the same path on narrow screens */
      if (img) img.style.transform = lay.side || sv.classList.contains('live') || sv.classList.contains('nogl') ? '' : `translateY(${((Math.max(0, lay.safe + .055 - (.5 - tall / 2)) * (1 - ease(seg(p, .03, .17))) - .08 * ease(seg(p, .03, .17))) * 100).toFixed(2)}vh)`;
    };
    measure(); addEventListener('resize', measure, { passive: true }); afterLoad(measure);
    let cur = prog(), last = 0, running = false, raf = 0, drawn = 0, first = true, tx = 0, ty = 0, px = 0, py = 0, moved = 0;
    sv.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; moved = performance.now(); }, { passive: true });
    sv.addEventListener('pointerleave', () => { tx = ty = 0; moved = performance.now(); }, { passive: true });
    const tick = now => {
      raf = 0; if (!running) return;
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      const k = 1 - Math.exp(-dt * 6); px += (tx - px) * k; py += (ty - py) * k;
      const target = prog();
      cur += (target - cur) * (1 - Math.exp(-dt * 8));
      if (Math.abs(target - cur) < .0002) cur = target;
      const moving = cur !== target;
      if ((moving || first) && !sv.classList.contains('nogl')) { dom(cur); first = false; }
      /* full frame rate while scrolling or turning, about 30 fps for the idle motion */
      if (window.__scene && (moving || now - moved < 1500 || now - drawn > 30)) { drawn = now; window.__scene.update(cur, now / 1000, px, py, lay); }
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver(es => { running = es[0].isIntersecting; if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }).observe(sv);
    afterLoad(() => loadScene(sv.dataset.src, () => sv.classList.add('nogl')));
  }
}

/* everything below exists on the homepage only */
const finder = $('finder');
if (finder) {
  const F = JSON.parse($('fd').textContent);
  const params = new URLSearchParams(location.search), want = params.get('svc');
  const sel = SVCS.includes(want) ? { [want]: 's' } : { web: 's' };
  const open = new Set(), plan = $('plan'), qf = $('qf');
  $('rows').addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.row; if (k) open[e.target.open ? 'add' : 'delete'](k); }, true);
  const render = anim => {
    $('svc').innerHTML = chipsHtml(F, sel);
    $('rows').innerHTML = rowsHtml(F, sel, open);
    const t = totals(F, sel), any = SVCS.some(k => sel[k]);
    $('lines').innerHTML = t.html;
    $('tot').hidden = !any; $('t1r').hidden = !t.once; $('t2r').hidden = !t.month;
    $('t1').textContent = fmt(t.once); $('t2').textContent = fmt(t.month);
    $('go').disabled = !any; qf.querySelector('[type=submit]').disabled = !any;
    if (anim && !reduce) { plan.classList.remove('flip'); void plan.offsetWidth; plan.classList.add('flip'); }
  };
  if (want) render(false);
  finder.addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    const d = c.dataset, key = d.size ? `[data-svc="${d.svc}"][data-size="${d.size}"]` : `[data-k="${d.k}"]`;
    if (d.size) sel[d.svc] = d.size; else if (sel[d.k]) delete sel[d.k]; else sel[d.k] = 's';
    render(true);
    const again = finder.querySelector(key); if (again) again.focus({ preventScroll: true });
  });
  document.addEventListener('click', e => { const s = e.target.closest('a[data-svc]'); if (s && !sel[s.dataset.svc]) { sel[s.dataset.svc] = 's'; render(false); } });

  /* the quote form */
  let opened = 0, busy = false;
  const status = (el, on) => { $('qdone').hidden = el !== 'done' || !on; $('qerr').hidden = el !== 'err' || !on; };
  $('go').addEventListener('click', () => { $('go').hidden = true; qf.hidden = false; opened = Date.now(); qf.elements.name.focus(); track('form_start'); });
  const fieldErr = (n, msg) => { const el = qf.elements[n], m = $('e-' + n); el.setAttribute('aria-invalid', msg ? 'true' : 'false'); m.textContent = msg; m.hidden = !msg; };
  qf.addEventListener('input', e => { const n = e.target.name; if ((n === 'name' || n === 'email') && !$('e-' + n).hidden) fieldErr(n, ''); });
  qf.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const fd = new FormData(qf), name = String(fd.get('name') || '').trim(), email = String(fd.get('email') || '').trim();
    const services = SVCS.filter(k => sel[k]).map(k => ({ k, size: sel[k] }));
    const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    fieldErr('name', name ? '' : F.form.badName); fieldErr('email', okMail ? '' : F.form.badEmail);
    if (!name || !okMail) { status(null); (name ? qf.elements.email : qf.elements.name).focus(); return; }
    const btn = qf.querySelector('[type=submit]'), label = btn.textContent;
    busy = true; btn.disabled = true; btn.textContent = F.form.sending; status(null);
    /* the server ignores forms sent within 2.5 s of opening (bots); a fast person with autofill just waits a moment */
    const wait = 2700 - (Date.now() - opened); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const body = { name, email, phone: String(fd.get('phone') || '').trim(), msg: String(fd.get('msg') || '').trim(), website: String(fd.get('website') || ''), services, lang, page: location.pathname, ms: Date.now() - opened };
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch('/api/offerte', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }).finally(() => clearTimeout(timer));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || r.status);
      qf.querySelector('.qg').hidden = true; btn.hidden = true; qf.querySelector('.qnote').hidden = true;
      $('qdone').textContent = F.form.done; status('done', true); $('qdone').focus();
      finder.classList.add('sent'); finder.querySelectorAll('.box button').forEach(b => { b.disabled = true; }); $('qagain').hidden = false;
      const t = totals(F, sel);
      track('generate_lead', { currency: 'CHF', value: t.once + t.month * 12, services: services.map(s => s.k + '_' + s.size).join(',') });
    } catch (err) {
      const t = totals(F, sel), subj = encodeURIComponent(lang === 'en' ? 'Quote request' : 'Offertanfrage');
      const text = encodeURIComponent([...t.lines.map(l => l.join(': ')), '', body.msg].join('\n'));
      const er = $('qerr'); er.innerHTML = '';
      const a = document.createElement('a'); a.href = `mailto:vincent@vincialmedia.com?subject=${subj}&body=${text}`; a.textContent = 'vincent@vincialmedia.com';
      er.append(F.form.err.split('vincent@vincialmedia.com')[0], a, F.form.err.split('vincent@vincialmedia.com')[1] || '');
      status('err', true); btn.disabled = false; btn.textContent = label;
    } finally { busy = false; }
  });

  $('qagain').addEventListener('click', () => {
    finder.classList.remove('sent'); $('qagain').hidden = true; status(null); render(false);
    qf.querySelector('.qg').hidden = false; qf.querySelector('.qnote').hidden = false; const b = qf.querySelector('[type=submit]'); b.hidden = false; b.disabled = false; b.textContent = F.form.send;
    qf.reset(); qf.hidden = true; $('go').hidden = false; $('svc').querySelector('button').focus();
  });

  /* hero: damped scroll progress drives the captions and the 3D scene */
  const scene = $('scene'), stage = $('stage'), hc = $('herocopy'), hint = $('hint'), scrim = $('scrim');
  const caps = [...scene.querySelectorAll('.cap')];
  const CAPT = [[.22, .29, .59, .63], [.66, .72, .81, .85], [.88, .93, 2, 3]];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const prog = () => { const r = scene.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - stage.offsetHeight), 0, 1); };
  const dom = p => {
    const h = 1 - seg(p, .03, .12);
    hc.style.opacity = h; hc.style.transform = `translateY(${(h - 1) * 70}px)`; hc.style.pointerEvents = h < .5 ? 'none' : '';
    hint.style.opacity = 1 - seg(p, 0, .03);
    let m = 0;
    caps.forEach((c, i) => { const k = CAPT[i], o = Math.min(seg(p, k[0], k[1]), 1 - seg(p, k[2], k[3])); m = Math.max(m, o); c.style.opacity = o; c.style.transform = `translateY(${(1 - o) * 26}px)`; });
    scrim.style.opacity = m;
    stage.classList.toggle('deep', p > .1 && p < .985);
  };
  /* no GPU, data saver or reduced motion: keep the static hero, decided before the user can scroll */
  const weak = weakGL();
  if (weak) scene.classList.add('nogl');
  let cur = prog(), last = 0, running = false, raf = 0, drawn = 0, first = true;
  const tick = now => {
    raf = 0; if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    const target = prog();
    cur += (target - cur) * (1 - Math.exp(-dt * 8));
    if (Math.abs(target - cur) < .0002) cur = target;
    const moving = cur !== target;
    if ((moving || first) && !scene.classList.contains('nogl')) { dom(cur); first = false; }
    /* full frame rate while scrolling, about 20 fps for the idle motion to save battery */
    if (window.__scene && (moving || now - drawn > 48)) { drawn = now; window.__scene.update(cur, now / 1000); }
    raf = requestAnimationFrame(tick);
  };
  if (!weak) new IntersectionObserver(es => { running = es[0].isIntersecting; if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }).observe(scene);

  /* the 3D engine loads after the page has finished loading, so text and layout come first */
  afterLoad(() => {
    if (!weak) loadScene(scene.dataset.src, () => scene.classList.add('nogl'));
  });
}

/* tells the safety timer in <head> that the page is wired up */
window.__vm = 1;

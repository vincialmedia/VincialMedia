// Browser runtime. Pages arrive fully rendered; this only adds behaviour and motion.
import { ORDER, SVCS, chipsHtml, rowsHtml, totals, fmt } from './shared.js';

const $ = id => document.getElementById(id);
const html = document.documentElement, lang = html.lang === 'en' ? 'en' : 'de';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* menu */
const burger = $('burger'), nav = $('nav');
const closeMenu = () => { burger.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); };
burger.addEventListener('click', () => { const o = burger.getAttribute('aria-expanded') !== 'true'; burger.setAttribute('aria-expanded', o); nav.classList.toggle('open', o); });
nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });

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
  qf.addEventListener('input', () => { if (!$('qerr').hidden && !$('qerr').querySelector('a')) status('err', false); });
  qf.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const fd = new FormData(qf), name = String(fd.get('name') || '').trim(), email = String(fd.get('email') || '').trim();
    const services = SVCS.filter(k => sel[k]).map(k => ({ k, size: sel[k] }));
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { const er = $('qerr'); er.textContent = F.form.bad; status('err', true); (name ? qf.elements.email : qf.elements.name).focus(); return; }
    const btn = qf.querySelector('[type=submit]'), label = btn.textContent;
    busy = true; btn.disabled = true; btn.textContent = F.form.sending; status(null);
    const body = { name, email, phone: String(fd.get('phone') || '').trim(), msg: String(fd.get('msg') || '').trim(), website: String(fd.get('website') || ''), services, lang, page: location.pathname, ms: Date.now() - opened };
    try {
      const r = await fetch('/api/offerte', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || r.status);
      qf.querySelector('.qg').hidden = true; btn.hidden = true; qf.querySelector('.qnote').hidden = true;
      $('qdone').textContent = F.form.done; status('done', true); $('qdone').focus();
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

  /* hero: damped scroll progress drives the captions and the 3D scene */
  const scene = $('scene'), stage = $('stage'), hc = $('herocopy'), hint = $('hint'), scrim = $('scrim');
  const caps = [...scene.querySelectorAll('.cap')];
  const CAPT = [[.37, .43, .54, .58], [.72, .77, .81, .85], [.9, .95, 2, 3]];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const prog = () => { const r = scene.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - stage.offsetHeight), 0, 1); };
  const dom = p => {
    const h = 1 - seg(p, .012, .08);
    hc.style.opacity = h; hc.style.transform = `translateY(${(h - 1) * 70}px)`; hc.style.pointerEvents = h < .5 ? 'none' : '';
    hint.style.opacity = 1 - seg(p, 0, .03);
    let m = 0;
    caps.forEach((c, i) => { const k = CAPT[i], o = Math.min(seg(p, k[0], k[1]), 1 - seg(p, k[2], k[3])); m = Math.max(m, o); c.style.opacity = o; c.style.transform = `translateY(${(1 - o) * 26}px)`; });
    scrim.style.opacity = m;
  };
  /* no GPU (software WebGL) or data saver: keep the static hero, decided before the user can scroll */
  const weak = (() => {
    if (!window.WebGLRenderingContext || (navigator.connection && navigator.connection.saveData)) return true;
    try {
      const g = document.createElement('canvas').getContext('webgl'); if (!g) return true;
      const x = g.getExtension('WEBGL_debug_renderer_info'), r = x ? String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)) : '';
      const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch (e) { return true; }
  })() && !/[?&]gl=1/.test(location.search);
  if (weak) scene.classList.add('nogl');
  let cur = prog(), last = 0, running = false, raf = 0;
  const tick = now => {
    raf = 0; if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    const target = prog();
    cur += (target - cur) * (1 - Math.exp(-dt * 8));
    if (Math.abs(target - cur) < .0002) cur = target;
    if (!scene.classList.contains('nogl')) dom(cur);
    if (window.__scene) window.__scene.update(cur, now / 1000);
    raf = requestAnimationFrame(tick);
  };
  if (!weak) new IntersectionObserver(es => { running = es[0].isIntersecting; if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }).observe(scene);

  /* the 3D engine loads after the page has finished loading, so text and layout come first */
  afterLoad(() => {
    if (weak) return;
    const s = document.createElement('script'); s.src = scene.dataset.src; s.async = true;
    s.onerror = () => scene.classList.add('nogl'); document.head.appendChild(s);
  });
}

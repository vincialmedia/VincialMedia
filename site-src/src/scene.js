/* VincialMedia 3D scenes. Real-time laptop + phone, three.js r160 (global THREE).
   Two uses: the scroll-driven hero on the homepage (#gl), and one device "shot" per service page (canvas[data-shot]).
   The page script owns scroll progress and the pointer and calls window.__scene.update(p, t, px, py).
   Words on the screens come from content.js through the JSON block #sd. */
(function () {
'use strict';
const T = window.THREE, doc = document, heroCv = doc.getElementById('gl'), shotCv = doc.querySelector('canvas[data-shot]');
const canvas = heroCv || shotCv, HERO = !!heroCv, SHOT = HERO ? '' : (window.__shot || (shotCv && shotCv.dataset.shot) || '');
const sceneEl = HERO ? doc.getElementById('scene') : canvas && canvas.closest('.shot'), stage = HERO ? doc.getElementById('stage') : canvas && canvas.parentElement;
const fail = () => { if (sceneEl) sceneEl.classList.add(HERO ? 'nogl' : 'still'); };
if (!T || !canvas) { fail(); return; }
const QS = new URLSearchParams(location.search), POSTER = QS.has('poster'), PT0 = parseFloat(QS.get('poster')) || 0;   // ?poster=<seconds> freezes a frame for the build's still images
const EN = doc.documentElement.lang.slice(0, 2) === 'en';
let S; try { S = JSON.parse(doc.getElementById('sd').textContent); } catch (e) { fail(); return; }
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: POSTER }); }
catch (e) { fail(); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(28, 1, 0.2, 80);

/* ---------- studio lighting: softboxes baked into an environment map ---------- */
(function studio() {
  const s = new T.Scene();
  s.add(new T.Mesh(new T.BoxGeometry(34, 18, 34), new T.MeshBasicMaterial({ color: 0x020203, side: T.BackSide })));
  const panel = (w, h, x, y, z, k, c) => {
    const m = new T.MeshBasicMaterial({ side: T.DoubleSide });
    m.color.set(c || 0xffffff).multiplyScalar(k);
    const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
    p.position.set(x, y, z); p.lookAt(0, 0, 0); s.add(p);
  };
  panel(11, 6, 0, 8, 1.5, 6);              // overhead softbox
  panel(3, 10, -10, 3.5, 3, 5, 0xdce8ff);  // left strip, cool
  panel(3, 10, 10, 4, -2, 6, 0xfff0df);    // right strip, warm
  panel(16, 2.2, 0, 3.2, -12, 11, 0xc9dcff); // back rim
  panel(9, 3, 0, 1.5, 13, 1.0);            // low front fill
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(s, 0.03).texture;
  pm.dispose();
})();
const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(-2.5, 7, 1); scene.add(key);
const rim = new T.DirectionalLight(0xbcd4ff, 2.0); rim.position.set(4, 3, -6); scene.add(rim);

/* ---------- geometry helpers ---------- */
function rrShape(w, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -h / 2, P = Math.PI;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -P / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, P / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, P / 2, P, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, P, P * 1.5, false);
  return s;
}
function plate(w, h, r, t, bevel, seg) {            // upright rounded plate, thickness along Z
  const g = new T.ExtrudeGeometry(rrShape(w, h, r), { depth: t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5, curveSegments: seg || 16 });
  g.translate(0, 0, bevel - t / 2);
  return g;
}
function slab(w, d, r, t, bevel, seg) { const g = plate(w, d, r, t, bevel, seg); g.rotateX(-Math.PI / 2); return g; }  // lying flat
function face(w, h, r, seg) {                        // flat rounded rectangle with 0..1 UVs
  const g = new T.ShapeGeometry(rrShape(w, h, r), seg || 16), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const io = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const out = t => 1 - Math.pow(1 - t, 3);

/* ---------- screen artwork, painted on 2D canvases ---------- */
const FONT = (w, s) => w + ' ' + s + 'px Inter, "Helvetica Neue", Arial, sans-serif';
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function tx(x, s, X, Y, w, size, col, align, ls) { x.font = FONT(w, size); x.fillStyle = col; x.textAlign = align || 'left'; if ('letterSpacing' in x) x.letterSpacing = (ls || 0) + 'px'; x.fillText(s, X, Y); }
function blob(x, cx, cy, rad, rgb, a) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(' + rgb + ',' + (a == null ? 1 : a) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
function art(x, X, Y, w, h, r, base, blobs) { x.save(); rr(x, X, Y, w, h, r); x.clip(); x.fillStyle = base; x.fillRect(X, Y, w, h); blobs.forEach(b => blob(x, X + b[0] * w, Y + b[1] * h, b[2] * Math.max(w, h), b[3], b[4])); x.restore(); }
function orb(x, cx, cy, r, light, mid, dark) {       // glossy studio sphere with a soft ground shadow
  x.save(); x.translate(cx, cy + r * 1.04); x.scale(1, 0.16); blob(x, 0, 0, r * 1.25, '0,0,0', 0.38); x.restore();
  const g = x.createRadialGradient(cx - r * 0.36, cy - r * 0.42, r * 0.04, cx, cy, r);
  g.addColorStop(0, light); g.addColorStop(0.45, mid); g.addColorStop(1, dark);
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip(); blob(x, cx + r * 0.55, cy + r * 0.7, r * 0.9, '255,255,255', 0.22); x.restore();
}
function card(x, X, Y, w, h, r, fill) { x.save(); x.shadowColor = 'rgba(0,0,0,.10)'; x.shadowBlur = 40; x.shadowOffsetY = 14; x.fillStyle = fill || '#fff'; rr(x, X, Y, w, h, r); x.fill(); x.restore(); }

const SW_PX = 1600, VH = 1046, SITE_H = 2500, CH = 72;
const BLUE = '#0071e3', INK = '#1d1d1f', MUTE = '#6e6e73';
const URLBAR = SHOT === 'case' ? 'buyauto.ch' : S.url;
const COOL = [[0.2, 0.2, 0.7, '122,200,255'], [0.85, 0.25, 0.6, '0,113,227'], [0.75, 0.9, 0.7, '255,170,120'], [0.1, 0.95, 0.55, '255,221,150']];
const WARM = [[0.2, 0.15, 0.7, '255,214,170'], [0.9, 0.3, 0.6, '255,140,105'], [0.5, 1, 0.7, '255,196,120']];
const MINT = [[0.2, 0.2, 0.7, '170,236,214'], [0.9, 0.3, 0.6, '70,180,160'], [0.4, 1, 0.7, '190,225,255']];

function drawSite(x) {
  x.fillStyle = '#fbfbfd'; x.fillRect(0, 0, SW_PX, SITE_H);
  let y = CH;
  tx(x, S.brand, 90, y + 64, 700, 32, INK, 'left', -1);
  S.nav.forEach((s, i) => tx(x, s, 720 + i * 150, y + 62, 500, 22, '#424245'));
  x.fillStyle = INK; rr(x, 1340, y + 28, 170, 54, 27); x.fill(); tx(x, S.shop, 1425, y + 63, 600, 21, '#fff', 'center');
  tx(x, S.kicker, 90, 300, 600, 25, BLUE);
  x.font = FONT(700, 104); const hs = Math.min(104, Math.floor(104 * 730 / Math.max(730, x.measureText(S.h1[0]).width, x.measureText(S.h1[1]).width)));
  tx(x, S.h1[0], 86, 420, 700, hs, INK, 'left', -4.5 * hs / 104);
  tx(x, S.h1[1], 86, 532, 700, hs, INK, 'left', -4.5 * hs / 104);
  tx(x, S.sub[0], 90, 612, 400, 28, MUTE);
  tx(x, S.sub[1], 90, 652, 400, 28, MUTE);
  x.fillStyle = BLUE; rr(x, 90, 712, 240, 68, 34); x.fill(); tx(x, S.shop, 210, 755, 600, 25, '#fff', 'center');
  tx(x, S.story, 366, 755, 500, 25, BLUE);
  art(x, 850, 190, 660, 760, 48, '#dfeeff', COOL);
  orb(x, 1215, 560, 205, '#ffffff', '#cfe3ff', '#5f93e6');
  orb(x, 1010, 760, 86, '#fff6ea', '#ffd0a6', '#e98952');
  card(x, 770, 770, 310, 150, 30);
  x.lineWidth = 12; x.strokeStyle = '#e5e5ea'; x.beginPath(); x.arc(845, 845, 40, 0, 7); x.stroke();
  x.strokeStyle = '#30b85a'; x.lineCap = 'round'; x.beginPath(); x.arc(845, 845, 40, -1.57, 4.5); x.stroke();
  tx(x, '100', 910, 842, 700, 40, INK, 'left', -1); tx(x, S.speed, 910, 876, 500, 20, MUTE);
  /* below the fold */
  tx(x, S.feat, 90, 1180, 700, 60, INK, 'left', -2);
  tx(x, S.all, 1510, 1176, 500, 24, BLUE, 'right');
  [[90, COOL, '#dfeeff'], [580, WARM, '#fff0e2'], [1070, MINT, '#e2f6ee']].forEach((c, i) => {
    art(x, c[0], 1230, 440, 500, 40, c[2], c[1]);
    orb(x, c[0] + 220, 1470, 120 - i * 8, '#ffffff', i === 1 ? '#ffd9b8' : i === 2 ? '#c8ecdf' : '#cfe3ff', i === 1 ? '#e58a52' : i === 2 ? '#3fa58e' : '#5f93e6');
    tx(x, S.items[i][0], c[0] + 6, 1790, 600, 30, INK); tx(x, S.items[i][1], c[0] + 6, 1830, 400, 24, MUTE);
  });
  x.fillStyle = INK; x.fillRect(0, 1920, SW_PX, 580);
  tx(x, S.foot[0], 90, 2130, 700, 96, '#f5f5f7', 'left', -4);
  tx(x, S.foot[1], 90, 2240, 700, 96, '#86868b', 'left', -4);
  x.fillStyle = BLUE; rr(x, 90, 2310, 250, 68, 34); x.fill(); tx(x, S.store, 215, 2353, 600, 24, '#fff', 'center');
}
function drawChrome(x) {
  x.clearRect(0, 0, SW_PX, VH);
  x.fillStyle = '#e9e9ee'; x.fillRect(0, 0, SW_PX, CH);
  x.fillStyle = '#d2d2d7'; x.fillRect(0, CH - 1, SW_PX, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(44 + i * 34, CH / 2, 11, 0, 7); x.fill(); });
  x.fillStyle = '#fff'; rr(x, 440, 14, 720, 44, 22); x.fill();
  tx(x, URLBAR, 800, 44, 500, 22, '#424245', 'center');
}
function drawDash(x) {
  x.fillStyle = '#f5f5f7'; x.fillRect(0, 0, SW_PX, VH);
  x.fillStyle = '#fff'; x.fillRect(0, CH, 250, VH);
  const DS = S.dash;
  tx(x, S.brand, 40, CH + 62, 700, 28, INK, 'left', -1);
  DS.nav.forEach((s, i) => {
    if (i === 1) { x.fillStyle = '#eaf3ff'; rr(x, 24, CH + 152, 202, 50, 12); x.fill(); }
    tx(x, s, 44, CH + 124 + i * 62, i === 1 ? 600 : 500, 22, i === 1 ? BLUE : '#424245');
  });
  tx(x, DS.h, 290, CH + 78, 700, 46, INK, 'left', -1.5);
  x.fillStyle = '#e8e8ed'; rr(x, 580, CH + 44, 170, 40, 20); x.fill(); tx(x, DS.sample, 665, CH + 71, 500, 18, MUTE, 'center');
  DS.kpi.forEach((k, i) => {
    const X = 290 + i * 322; card(x, X, CH + 120, 300, 150, 24);
    tx(x, k[0], X + 26, CH + 166, 500, 21, MUTE); tx(x, k[1], X + 26, CH + 228, 700, 46, INK, 'left', -1.5);
    x.fillStyle = '#e3f6e8'; rr(x, X + 196, CH + 142, 84, 34, 17); x.fill(); tx(x, k[2], X + 238, CH + 165, 600, 17, '#1f8f43', 'center');
  });
  card(x, 290, CH + 300, 870, 640, 28);
  tx(x, DS.chart, 322, CH + 356, 600, 26, INK);
  const pts = [22, 26, 24, 33, 38, 36, 47, 52, 58, 71, 78, 92], X0 = 340, Y0 = CH + 880, WW = 770, HH = 440;
  x.strokeStyle = '#ececf0'; x.lineWidth = 2; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(X0, Y0 - i * HH / 4); x.lineTo(X0 + WW, Y0 - i * HH / 4); x.stroke(); }
  const px = i => X0 + i * WW / (pts.length - 1), py = v => Y0 - v / 100 * HH;
  x.beginPath(); x.moveTo(px(0), py(pts[0])); for (let i = 1; i < pts.length; i++) { const mx = (px(i - 1) + px(i)) / 2; x.bezierCurveTo(mx, py(pts[i - 1]), mx, py(pts[i]), px(i), py(pts[i])); }
  x.strokeStyle = BLUE; x.lineWidth = 6; x.lineCap = 'round'; x.stroke();
  x.lineTo(px(pts.length - 1), Y0); x.lineTo(px(0), Y0); x.closePath();
  const g = x.createLinearGradient(0, Y0 - HH, 0, Y0); g.addColorStop(0, 'rgba(0,113,227,.28)'); g.addColorStop(1, 'rgba(0,113,227,0)'); x.fillStyle = g; x.fill();
  x.fillStyle = '#fff'; x.strokeStyle = BLUE; x.lineWidth = 6; x.beginPath(); x.arc(px(11), py(92), 11, 0, 7); x.fill(); x.stroke();
  card(x, 1190, CH + 300, 372, 640, 28);
  tx(x, DS.best, 1220, CH + 356, 600, 26, INK);
  art(x, 1220, CH + 384, 312, 300, 24, '#dfeeff', COOL); orb(x, 1376, CH + 524, 84, '#fff', '#cfe3ff', '#5f93e6');
  [0.92, 0.64, 0.38].forEach((v, i) => {
    const b = [DS.bars[i], v], Y = CH + 736 + i * 66; tx(x, b[0], 1220, Y, 500, 20, '#424245');
    x.fillStyle = '#ececf0'; rr(x, 1220, Y + 14, 312, 12, 6); x.fill(); x.fillStyle = i ? '#9cc4f5' : BLUE; rr(x, 1220, Y + 14, 312 * b[1], 12, 6); x.fill();
  });
}
const PW_PX = 720, PH_PX = 1558;
function sbar(x, col, time) {                        // phone status bar: time left, battery right, camera in the middle
  tx(x, time || '9:30', 64, 82, 600, 30, col);
  x.strokeStyle = col === '#fff' ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)'; x.lineWidth = 3; rr(x, 596, 56, 54, 28, 9); x.stroke(); x.fillStyle = col; rr(x, 601, 61, 36, 18, 5); x.fill();
}
function wrap(x, s, max, w, size) {                  // break a sentence into lines that fit
  x.font = FONT(w, size); if ('letterSpacing' in x) x.letterSpacing = '0px';
  const out = []; let cur = '';
  s.split(' ').forEach(word => { const t = cur ? cur + ' ' + word : word; if (cur && x.measureText(t).width > max) { out.push(cur); cur = word; } else cur = t; });
  if (cur) out.push(cur); return out;
}
const today = () => POSTER ? (EN ? 'Thursday, 26 November' : 'Donnerstag, 26. November') : new Date().toLocaleDateString(EN ? 'en-GB' : 'de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
function drawApp(x) {
  const A = S.app;
  x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, PW_PX, PH_PX);
  sbar(x, '#fff');
  tx(x, today(), 48, 190, 500, 26, '#8e8e93');
  tx(x, A.hello, 46, 258, 700, 62, '#fff', 'left', -2.5);
  const g = x.createLinearGradient(40, 310, 680, 660); g.addColorStop(0, '#0a84ff'); g.addColorStop(1, '#5e5ce6');
  x.fillStyle = g; rr(x, 40, 310, 640, 350, 48); x.fill();
  x.save(); rr(x, 40, 310, 640, 350, 48); x.clip(); blob(x, 620, 340, 300, '255,255,255', 0.28); blob(x, 100, 680, 260, '120,220,255', 0.35); x.restore();
  tx(x, A.next, 84, 388, 500, 26, 'rgba(255,255,255,.85)');
  tx(x, A.today, 82, 468, 700, 60, '#fff', 'left', -2);
  tx(x, A.place, 84, 516, 500, 28, 'rgba(255,255,255,.9)');
  x.fillStyle = '#fff'; rr(x, 84, 560, 220, 64, 32); x.fill(); tx(x, A.checkin, 194, 601, 600, 25, '#0a3fa8', 'center');
  tx(x, A.quick, 48, 748, 600, 30, '#fff');
  [['#30d158'], ['#ff9f0a'], ['#64d2ff'], ['#ff6482']].forEach((a, i) => {
    const X = 40 + (i % 2) * 328, Y = 784 + Math.floor(i / 2) * 200;
    x.fillStyle = '#1c1c1e'; rr(x, X, Y, 312, 180, 40); x.fill();
    const gg = x.createRadialGradient(X + 60, Y + 54, 2, X + 70, Y + 66, 36); gg.addColorStop(0, '#fff'); gg.addColorStop(0.25, a[0]); gg.addColorStop(1, a[0]);
    x.fillStyle = gg; x.beginPath(); x.arc(X + 70, Y + 66, 30, 0, 7); x.fill();
    tx(x, A.acts[i], X + 40, Y + 146, 600, 28, '#fff');
  });
  tx(x, A.recent, 48, 1240, 600, 30, '#fff');
  A.rows.forEach((r, i) => {
    const Y = 1268 + i * 72; x.fillStyle = '#1c1c1e'; rr(x, 40, Y, 640, 62, 20); x.fill();
    tx(x, r[0], 66, Y + 41, 500, 24, '#fff'); tx(x, r[1], 654, Y + 41, 400, 22, '#8e8e93', 'right');
  });
  x.fillStyle = 'rgba(44,44,46,.96)'; rr(x, 40, 1424, 640, 100, 50); x.fill();
  x.fillStyle = '#0a84ff'; rr(x, 56, 1438, 150, 72, 36); x.fill(); tx(x, A.tabs[0], 131, 1483, 600, 24, '#fff', 'center');
  A.tabs.slice(1).forEach((s, i) => tx(x, s, 290 + i * 150, 1483, 500, 23, '#aeaeb2', 'center'));
}
/* booking screen of the sample app: sel 0..1 fades the chosen slot in, press darkens the button */
function drawBook(x, sel, press) {
  const B = S.app.book;
  x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, PW_PX, PH_PX);
  sbar(x, '#fff');
  tx(x, '‹', 44, 206, 500, 64, '#0a84ff');
  tx(x, B.h, 46, 300, 700, 62, '#fff', 'left', -2.5); tx(x, B.sub, 48, 350, 500, 28, '#8e8e93');
  B.days.forEach((d, i) => {
    const X = 40 + i * 132, on = i === 3;
    x.fillStyle = on ? '#0a84ff' : '#1c1c1e'; rr(x, X, 410, 116, 136, 34); x.fill();
    tx(x, d, X + 58, 458, 500, 24, on ? 'rgba(255,255,255,.85)' : '#8e8e93', 'center'); tx(x, String(23 + i), X + 58, 516, 700, 42, '#fff', 'center');
  });
  B.slots.forEach((s, i) => {
    const X = 40 + (i % 2) * 328, Y = 600 + Math.floor(i / 2) * 136;
    x.fillStyle = '#1c1c1e'; rr(x, X, Y, 312, 120, 32); x.fill();
    if (i === 2 && sel > 0) { x.globalAlpha = sel; x.fillStyle = '#0a84ff'; rr(x, X, Y, 312, 120, 32); x.fill(); x.globalAlpha = 1; }
    tx(x, s, X + 156, Y + 73, 600, 36, '#fff', 'center');
  });
  if (sel > 0) { x.globalAlpha = sel; x.fillStyle = '#1c1c1e'; rr(x, 40, 1040, 640, 120, 32); x.fill(); x.fillStyle = '#30d158'; x.beginPath(); x.arc(92, 1100, 12, 0, 7); x.fill(); tx(x, B.doneSub, 124, 1111, 500, 28, '#fff'); x.globalAlpha = 1; }
  x.globalAlpha = sel > 0 ? 1 : 0.35; x.fillStyle = press ? '#0066cc' : '#0a84ff'; rr(x, 40, 1380, 640, 104, 52); x.fill(); tx(x, B.cta, 360, 1445, 600, 34, '#fff', 'center'); x.globalAlpha = 1;
}
function drawSheet(x, u) {                           // "booked" sheet sliding up over the booking screen
  const B = S.app.book, top = PH_PX - 620 * u;
  x.fillStyle = 'rgba(0,0,0,' + 0.55 * u + ')'; x.fillRect(0, 0, PW_PX, PH_PX);
  x.fillStyle = '#1c1c1e'; rr(x, 16, top, 688, 700, 64); x.fill();
  x.fillStyle = '#30d158'; x.beginPath(); x.arc(360, top + 170, 70, 0, 7); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 12; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(328, top + 172); x.lineTo(352, top + 196); x.lineTo(396, top + 146); x.stroke();
  tx(x, B.done, 360, top + 330, 700, 60, '#fff', 'center', -2); tx(x, B.doneSub, 360, top + 388, 500, 28, '#8e8e93', 'center');
}
/* chat with the AI assistant: tt is the time inside the loop, messages arrive one by one */
function drawChat(x, tt) {
  const Cc = S.chat, AT = [0.5, 2.5, 4.3, 6.0], TYPE = [[1.3, 2.5], [5.0, 6.0]], DONE = 7.2, fade = 1 - seg(tt, 12.5, 13.2);
  x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, PW_PX, PH_PX);
  sbar(x, '#fff', Cc.time);
  const av = x.createLinearGradient(46, 152, 122, 228); av.addColorStop(0, '#7ac8ff'); av.addColorStop(1, BLUE);
  x.fillStyle = av; x.beginPath(); x.arc(84, 190, 38, 0, 7); x.fill();
  tx(x, Cc.name, 142, 186, 700, 34, '#fff', 'left', -0.5); x.fillStyle = '#30d158'; x.beginPath(); x.arc(150, 216, 7, 0, 7); x.fill(); tx(x, Cc.role, 166, 225, 500, 24, '#8e8e93');
  x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, 262, PW_PX, 2);
  let y = 300;
  const bubble = (me, lines, k) => {
    x.font = FONT(500, 38); const w = Math.max.apply(null, lines.map(l => x.measureText(l).width)) + 60, h = lines.length * 50 + 40, X = me ? PW_PX - 40 - w : 40;
    x.save(); x.globalAlpha = k * fade; x.translate(0, (1 - k) * 26);
    x.fillStyle = me ? '#0a84ff' : '#26262b'; rr(x, X, y, w, h, 34); x.fill();
    lines.forEach((l, i) => tx(x, l, X + 30, y + 58 + i * 50, 500, 38, me ? '#fff' : '#f5f5f7'));
    x.restore(); y += h + 20;
  };
  Cc.msgs.forEach((m, i) => { const k = out(seg(tt, AT[i], AT[i] + 0.3)); if (k > 0) bubble(m[0] === 'u', wrap(x, m[1], 500, 500, 38), k); });
  TYPE.forEach(w => { if (tt > w[0] && tt < w[1]) { x.fillStyle = '#26262b'; rr(x, 40, y, 132, 80, 34); x.fill(); for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * Math.max(0, Math.sin(tt * 7 - i * 0.9))) + ')'; x.beginPath(); x.arc(78 + i * 28, y + 40, 9, 0, 7); x.fill(); } } });
  const d = out(seg(tt, DONE, DONE + 0.4));
  if (d > 0) {
    x.save(); x.globalAlpha = d * fade; x.translate(0, (1 - d) * 26);
    x.fillStyle = '#0f2417'; rr(x, 40, y + 6, 640, 158, 34); x.fill(); x.strokeStyle = 'rgba(48,209,88,.45)'; x.lineWidth = 2; rr(x, 40, y + 6, 640, 158, 34); x.stroke();
    Cc.done.forEach((s, i) => { const Y = y + 58 + i * 60; x.fillStyle = '#30d158'; x.beginPath(); x.arc(84, Y - 9, 16, 0, 7); x.fill(); x.strokeStyle = '#0f2417'; x.lineWidth = 4.5; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(76, Y - 8); x.lineTo(82, Y - 2); x.lineTo(93, Y - 15); x.stroke(); tx(x, s, 116, Y, 600, 28, '#d9f7e1'); });
    x.restore();
  }
  x.fillStyle = '#1c1c1e'; rr(x, 40, 1424, 640, 92, 46); x.fill(); tx(x, Cc.input, 84, 1481, 400, 30, '#6e6e73');
  x.fillStyle = '#0a84ff'; x.beginPath(); x.arc(634, 1470, 30, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(634, 1484); x.lineTo(634, 1456); x.moveTo(622, 1468); x.lineTo(634, 1456); x.lineTo(646, 1468); x.stroke();
}
/* a search on the phone: the query is typed, the ad shows first, a tap turns into an enquiry */
function drawSearch(x, tt) {
  const Q = S.search, n = Math.round(seg(tt, 0.6, 2.2) * Q.q.length), k = out(seg(tt, 2.4, 2.9)) * (1 - seg(tt, 11, 11.6)), tap = tt > 4.6 && tt < 5.0, toast = out(seg(tt, 5.3, 5.8)) * (1 - seg(tt, 10.8, 11.2));
  x.fillStyle = '#fff'; x.fillRect(0, 0, PW_PX, PH_PX);
  sbar(x, INK);
  x.fillStyle = '#f2f2f7'; rr(x, 32, 128, 656, 96, 48); x.fill();
  x.strokeStyle = MUTE; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.arc(78, 173, 15, 0, 7); x.moveTo(89, 185); x.lineTo(100, 197); x.stroke();
  const typed = tt >= 11.6 ? '' : Q.q.slice(0, n); tx(x, typed, 122, 189, 500, 34, INK);
  if (k < 0.5 && Math.sin(tt * 9) > -0.2) { x.font = FONT(500, 34); x.fillStyle = BLUE; x.fillRect(126 + x.measureText(typed).width, 154, 3, 44); }
  if (k > 0) {
    x.save(); x.globalAlpha = k; x.translate(0, (1 - k) * 30);
    tx(x, Q.spons, 40, 306, 700, 26, INK);
    const av = x.createLinearGradient(40, 340, 92, 392); av.addColorStop(0, '#7ac8ff'); av.addColorStop(1, BLUE); x.fillStyle = av; x.beginPath(); x.arc(66, 366, 26, 0, 7); x.fill();
    tx(x, Q.dom, 108, 375, 500, 27, '#3c4043');
    Q.h.forEach((l, i) => tx(x, l, 40, 462 + i * 52, 600, 42, BLUE, 'left', -1));
    Q.d.forEach((l, i) => tx(x, l, 40, 572 + i * 40, 400, 28, MUTE));
    x.fillStyle = tap ? '#0058b0' : BLUE; rr(x, 40, 660, 304, 88, 44); x.fill(); tx(x, Q.call, 192, 715, 600, 30, '#fff', 'center');
    x.strokeStyle = '#d2d2d7'; x.lineWidth = 3; rr(x, 368, 660, 304, 88, 44); x.stroke(); tx(x, Q.quote, 520, 715, 600, 30, INK, 'center');
    if (tap) { const r = seg(tt, 4.6, 5.0); x.fillStyle = 'rgba(255,255,255,' + 0.35 * (1 - r) + ')'; x.beginPath(); x.arc(192, 704, 30 + r * 90, 0, 7); x.fill(); }
    x.fillStyle = '#e5e5ea'; x.fillRect(40, 800, 640, 2);
    Q.other.forEach((s, i) => { const Y = 870 + i * 200; tx(x, s, 40, Y, 500, 31, '#5f6368'); x.fillStyle = '#ececf0'; rr(x, 40, Y + 30, 600, 18, 9); x.fill(); rr(x, 40, Y + 64, 430, 18, 9); x.fill(); x.fillStyle = '#f2f2f7'; x.fillRect(40, Y + 124, 640, 2); });
    x.fillStyle = '#ececf0'; rr(x, 40, 1290, 560, 18, 9); x.fill(); rr(x, 40, 1324, 380, 18, 9); x.fill();
    x.restore();
  }
  if (toast > 0) {
    const Y = PH_PX + 20 - toast * 196;                // rises from the bottom so the search stays readable
    x.save(); x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 40; x.shadowOffsetY = 16; x.fillStyle = 'rgba(28,28,30,.97)'; rr(x, 24, Y, 672, 136, 38); x.fill(); x.restore();
    x.fillStyle = '#30d158'; x.beginPath(); x.arc(74, Y + 68, 14, 0, 7); x.fill();
    tx(x, Q.toast, 108, Y + 60, 700, 31, '#fff'); tx(x, Q.toastSub, 108, Y + 100, 400, 25, '#aeaeb2');
  }
}
function drawAd(x) {
  x.fillStyle = '#fff'; x.fillRect(0, 0, PW_PX, PH_PX);
  const AD = S.ad;
  sbar(x, INK);
  tx(x, AD.feed, 46, 196, 700, 54, INK, 'left', -2);
  const av = x.createLinearGradient(46, 244, 118, 316); av.addColorStop(0, '#7ac8ff'); av.addColorStop(1, BLUE);
  x.fillStyle = av; x.beginPath(); x.arc(82, 280, 36, 0, 7); x.fill();
  tx(x, S.brand, 138, 274, 600, 27, INK); tx(x, AD.spons, 138, 308, 400, 22, MUTE);
  art(x, 0, 340, 720, 800, 0, '#dfeeff', COOL);
  orb(x, 430, 700, 220, '#ffffff', '#cfe3ff', '#5f93e6'); orb(x, 190, 930, 92, '#fff6ea', '#ffd0a6', '#e98952');
  x.font = FONT(700, 84); const as = Math.min(84, Math.floor(84 * 620 / Math.max(620, x.measureText(AD.h).width)));
  tx(x, AD.h, 44, 452, 700, as, '#0b2a55', 'left', -3.5 * as / 84);
  x.fillStyle = '#0b2a55'; rr(x, 46, 486, 300, 60, 30); x.fill(); tx(x, AD.off, 196, 525, 600, 24, '#fff', 'center');
  x.fillStyle = '#f2f2f7'; x.fillRect(0, 1140, 720, 96); tx(x, AD.shop, 46, 1198, 600, 28, INK); tx(x, '›', 676, 1200, 500, 36, MUTE, 'right');
  x.strokeStyle = INK; x.lineWidth = 4.5; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); x.moveTo(74, 1318); x.bezierCurveTo(40, 1288, 52, 1262, 74, 1280); x.bezierCurveTo(96, 1262, 108, 1288, 74, 1318); x.stroke();
  x.beginPath(); x.arc(170, 1290, 24, 0.6, 6.4); x.lineTo(150, 1322); x.stroke();
  x.beginPath(); x.moveTo(238, 1276); x.lineTo(296, 1268); x.lineTo(270, 1320); x.lineTo(262, 1294); x.closePath(); x.stroke();
  tx(x, AD.likes, 46, 1384, 600, 25, INK);
  tx(x, S.brand, 46, 1426, 600, 25, INK); x.font = FONT(600, 25); tx(x, AD.cap, 58 + x.measureText(S.brand).width, 1426, 400, 25, INK);
  x.fillStyle = '#e5e5ea'; x.fillRect(0, 1470, 720, 2);
  x.fillStyle = '#ffd0a6'; x.beginPath(); x.arc(82, 1530, 36, 0, 7); x.fill(); tx(x, 'studio.nord', 138, 1540, 600, 27, INK);
}
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.userData.x = x;
  t.userData.paint = a => { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; draw(x, a); x.restore(); t.needsUpdate = true; };
  t.userData.paint(0);
  return t;
}
/* which screens this page needs: the hero uses all five, a shot only its own */
const LAP = HERO || /^(web|local|ads|case)$/.test(SHOT), PHONE = HERO || /^(app|auto|ads|case)$/.test(SHOT);
const CASE = SHOT === 'case' ? (window.__caseImgs || {}) : null;
const still = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x); return c; };
let frames = null;                                   // pre-drawn app screens, composed while the sequence plays
function paintFrames() { frames = { home: still(PW_PX, PH_PX, drawApp), b0: still(PW_PX, PH_PX, x => drawBook(x, 0, false)), b1: still(PW_PX, PH_PX, x => drawBook(x, 1, false)), b2: still(PW_PX, PH_PX, x => drawBook(x, 1, true)) }; }
function drawAppSeq(x, tt) {                         // home, slide to booking, pick a slot, book, confirmation, back
  if (!frames) paintFrames();
  const F = frames;
  if (tt < 3) { x.drawImage(F.home, 0, 0); return; }
  if (tt < 3.45) { const k = io(seg(tt, 3, 3.45)); x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, PW_PX, PH_PX); x.globalAlpha = 1 - k * 0.7; x.drawImage(F.home, -k * 220, 0); x.globalAlpha = 1; x.drawImage(F.b0, (1 - k) * PW_PX, 0); return; }
  const sel = seg(tt, 4.2, 4.45), press = tt > 5.0 && tt < 5.25, sheet = out(seg(tt, 5.35, 5.8)), back = seg(tt, 8.7, 9.2);
  x.drawImage(sel >= 1 ? (press ? F.b2 : F.b1) : F.b0, 0, 0);
  if (sel > 0 && sel < 1) { x.globalAlpha = sel; x.drawImage(F.b1, 0, 0); x.globalAlpha = 1; }
  if (sheet > 0) drawSheet(x, sheet);
  if (back > 0) { x.globalAlpha = back; x.drawImage(F.home, 0, 0); x.globalAlpha = 1; }
}
const SEQ = { app: [drawAppSeq, 9.2, 2], auto: [drawChat, 13.6, 9], ads: [drawSearch, 12, 8] }[SHOT];   // painter, loop length, frame used for the still image
function drawShot(x, key) {                          // a real screenshot (own project), or black until it has loaded
  const im = CASE && CASE[key]; x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, x.canvas.width, x.canvas.height);
  if (!im || !im.complete || !im.naturalWidth) return;
  if (key === 'd') { drawChrome(x); x.drawImage(im, 0, CH, SW_PX, SW_PX * im.naturalHeight / im.naturalWidth); }
  else x.drawImage(im, 0, 0, PW_PX, PW_PX * im.naturalHeight / im.naturalWidth);
}
const tex = {};
if (LAP) {
  if (CASE) tex.site = ctex(SW_PX, VH, x => drawShot(x, 'd'));
  else if (SHOT === 'ads') tex.site = ctex(SW_PX, VH, drawDash);
  else { tex.site = ctex(SW_PX, SITE_H, drawSite); tex.site.repeat.set(1, VH / SITE_H); }
  if (!CASE) tex.chrome = ctex(SW_PX, VH, drawChrome);
  if (HERO) tex.dash = ctex(SW_PX, VH, drawDash);
}
if (PHONE) {
  tex.app = ctex(PW_PX, PH_PX, CASE ? x => drawShot(x, 'm') : SEQ ? (x, a) => SEQ[0](x, a || 0) : drawApp);
  if (HERO) tex.ad = ctex(PW_PX, PH_PX, drawAd);
}
const SITE_TOP = 1 - VH / SITE_H, SCROLLS = LAP && !CASE && SHOT !== 'ads';
if (SCROLLS) tex.site.offset.y = SITE_TOP;
const repaint = () => { frames = null; Object.keys(tex).forEach(k => tex[k].userData.paint(seqT)); };
let seqT = SEQ ? SEQ[2] : 0, ready = false, pending = 1;
const settle = () => { if (--pending <= 0) { repaint(); ready = true; } };
if (CASE) ['d', 'm'].forEach(k => { const im = CASE[k]; if (im && !im.complete) { pending++; im.addEventListener('load', settle); im.addEventListener('error', settle); } });
if (document.fonts && document.fonts.load) Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(w + ' 24px Inter'))).then(settle, settle); else settle();

/* ---------- materials ---------- */
const decal = (m, n) => { m.polygonOffset = true; m.polygonOffsetFactor = -n; m.polygonOffsetUnits = -n * 4; return m; };
const lit = (t, n, tr) => decal(new T.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, roughness: 0.16, metalness: 0, toneMapped: false, transparent: !!tr, opacity: tr ? 0 : 1 }), n);
const M = {
  alu: new T.MeshStandardMaterial({ color: 0xb6b8bd, metalness: 1, roughness: 0.42, envMapIntensity: 0.95 }),
  pad: decal(new T.MeshStandardMaterial({ color: 0xb0b2b7, metalness: 1, roughness: 0.3, envMapIntensity: 0.9 }), 2),
  seam: decal(new T.MeshStandardMaterial({ color: 0x6d6f75, metalness: 1, roughness: 0.4 }), 1),
  well: decal(new T.MeshStandardMaterial({ color: 0x050506, metalness: 0, roughness: 0.95, envMapIntensity: 0.25 }), 1),
  key: new T.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0, roughness: 0.6, envMapIntensity: 0.4 }),
  glass: decal(new T.MeshPhysicalMaterial({ color: 0x020203, metalness: 0, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03 }), 1),
  hinge: new T.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.9, roughness: 0.35 }),
  ti: new T.MeshStandardMaterial({ color: 0x5a5b61, metalness: 1, roughness: 0.27 }),
  back: decal(new T.MeshPhysicalMaterial({ color: 0x1b1c21, metalness: 0.25, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.25 }), 1),
  island: new T.MeshPhysicalMaterial({ color: 0x232429, metalness: 0.3, roughness: 0.3, clearcoat: 0.6 }),
  lens: decal(new T.MeshPhysicalMaterial({ color: 0x04050a, metalness: 0.4, roughness: 0.04, clearcoat: 1 }), 4),
  siteA: lit(tex.site || null, 2), siteB: lit(tex.dash || null, 3, true),
  chrome: decal(new T.MeshBasicMaterial({ map: tex.chrome || null, transparent: true, toneMapped: false, depthWrite: false }), 4),
  appA: lit(tex.app || null, 2), appB: lit(tex.ad || null, 3, true)
};

/* ---------- models ---------- */
const W = 3.04, D = 2.12, BT = 0.11, LT = 0.046, HZ = 0.035, GAP = 0.006;
const SW = W - 0.15, SH = SW * VH / SW_PX;
const KU = 0.186, KG = 0.024, KZ = -D / 2 + 0.2, KW = 14.5 * KU, KD = 5.5 * KU;
const ROWS = [
  { h: 0.5, k: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] },
  { h: 1, k: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] },
  { h: 1, k: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { h: 1, k: [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75] },
  { h: 1, k: [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25] },
  { h: 1, k: [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1] }
];
const keyGroups = {};
(function () {
  let z = KZ;
  ROWS.forEach(r => { let x = -KW / 2; r.k.forEach(w => { const id = w + '_' + r.h; (keyGroups[id] = keyGroups[id] || { w, h: r.h, at: [] }).at.push([x + w * KU / 2, z + r.h * KU / 2]); x += w * KU; }); z += r.h * KU; });
  Object.keys(keyGroups).forEach(id => { const k = keyGroups[id]; k.geo = slab(k.w * KU - KG, k.h * KU - KG, 0.02, 0.02, 0.005, 3); });
})();
const PW = 0.72, PH = 1.5, PT = 0.082, PSW = PW - 0.05, PSH = PSW * PH_PX / PW_PX;
const G = {
  base: slab(W, D, 0.13, BT, 0.014), lid: slab(W, D, 0.13, LT, 0.012),
  well: face(KW + 0.05, KD + 0.05, 0.035), padSeam: face(1.236, 0.756, 0.036), pad: face(1.22, 0.74, 0.03), lip: face(0.46, 0.022, 0.011),
  hinge: new T.CylinderGeometry(0.03, 0.03, W * 0.74, 24).rotateZ(Math.PI / 2),
  bezel: face(W - 0.024, D - 0.024, 0.12), screen: face(SW, SH, 0.045), cam: new T.CircleGeometry(0.013, 20),
  pbody: plate(PW, PH, 0.118, PT, 0.016), pglass: face(PW - 0.012, PH - 0.012, 0.112), pscreen: face(PSW, PSH, 0.094), punch: new T.CircleGeometry(0.021, 24),
  island: plate(0.3, 0.3, 0.08, 0.03, 0.008), ring: new T.CylinderGeometry(0.062, 0.062, 0.016, 32).rotateX(Math.PI / 2), lensG: new T.CircleGeometry(0.046, 32)
};
function mesh(g, m, x, y, z, rx, ry) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; return o; }
function buildSet() {
  const g = new T.Group(), H = Math.PI / 2;
  const lap = new T.Group(); g.add(lap);
  lap.add(mesh(G.base, M.alu, 0, BT / 2, 0));
  lap.add(mesh(G.well, M.well, 0, BT + 0.0008, KZ + KD / 2, -H));
  Object.keys(keyGroups).forEach(id => { const k = keyGroups[id], im = new T.InstancedMesh(k.geo, M.key, k.at.length), m4 = new T.Matrix4(); k.at.forEach((p, i) => { m4.makeTranslation(p[0], BT + 0.002, p[1]); im.setMatrixAt(i, m4); }); lap.add(im); });
  lap.add(mesh(G.padSeam, M.seam, 0, BT + 0.0006, 0.615, -H));
  lap.add(mesh(G.pad, M.pad, 0, BT + 0.0012, 0.615, -H));
  lap.add(mesh(G.lip, M.seam, 0, BT + 0.0006, D / 2 - 0.02, -H));
  lap.add(mesh(G.hinge, M.hinge, 0, BT - 0.004, -D / 2 + HZ));
  const pivot = new T.Group(); pivot.position.set(0, BT + GAP, -D / 2 + HZ); lap.add(pivot);
  const lz = D / 2 - HZ, sz = lz + 0.036;
  pivot.add(mesh(G.lid, M.alu, 0, LT / 2, lz));
  pivot.add(mesh(G.bezel, M.glass, 0, -0.0008, lz, H));
  pivot.add(mesh(G.screen, M.siteA, 0, -0.0016, sz, H));
  const sB = mesh(G.screen, M.siteB, 0, -0.0024, sz, H); pivot.add(sB);
  const sC = mesh(G.screen, M.chrome, 0, -0.0032, sz, H); pivot.add(sC);
  pivot.add(mesh(G.cam, M.lens, 0, -0.0034, lz + D / 2 - 0.036, H));
  const ph = new T.Group(); g.add(ph);
  ph.add(mesh(G.pbody, M.ti));
  ph.add(mesh(G.pglass, M.glass, 0, 0, PT / 2 + 0.0008));
  ph.add(mesh(G.pscreen, M.appA, 0, 0, PT / 2 + 0.0016));
  const pB = mesh(G.pscreen, M.appB, 0, 0, PT / 2 + 0.0024); ph.add(pB);
  ph.add(mesh(G.punch, M.lens, 0, PH / 2 - 0.072, PT / 2 + 0.003));
  ph.add(mesh(G.pglass, M.back, 0, 0, -(PT / 2 + 0.0008), 0, Math.PI));
  ph.add(mesh(G.island, M.island, 0.17, PH / 2 - 0.2, -(PT / 2 + 0.012)));
  [[0.11, 0.06], [0.23, -0.06]].forEach(p => {
    ph.add(mesh(G.ring, M.ti, p[0], PH / 2 - 0.2 + p[1], -(PT / 2 + 0.03)));
    ph.add(mesh(G.lensG, M.lens, p[0], PH / 2 - 0.2 + p[1], -(PT / 2 + 0.0385), 0, Math.PI));
  });
  return { g, lap, pivot, ph, sB, sC, pB };
}
const real = buildSet(), mirror = buildSet(), sets = [real, mirror];
mirror.g.scale.y = -1;
scene.add(mirror.g, real.g);
[real.sB, real.pB, real.sC].forEach(o => { o.renderOrder = 3; });
const glowLight = new T.PointLight(0xdfe9ff, 0, 9, 2); glowLight.position.set(0, -0.7, D / 2 + 0.1); real.pivot.add(glowLight);

/* glossy black floor: dims the mirrored copy, fades it out with distance */
function radial(stops) { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(s => g.addColorStop(s[0], s[1])); x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }
const floor = new T.Mesh(new T.PlaneGeometry(18, 18).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,.74)'], [0.3, 'rgba(0,0,0,.82)'], [0.62, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]), transparent: true, depthWrite: false, toneMapped: false }));
floor.renderOrder = 1; scene.add(floor);
const pool = new T.Mesh(new T.PlaneGeometry(8, 5.5).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: radial([[0, 'rgba(120,170,255,.55)'], [0.45, 'rgba(60,120,255,.16)'], [1, 'rgba(40,100,255,0)']]), transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending, opacity: 0 }));
pool.position.set(0, 0.002, 0.7); pool.renderOrder = 2; scene.add(pool);
const halo = new T.Mesh(new T.PlaneGeometry(11, 6), new T.MeshBasicMaterial({ map: radial([[0, 'rgba(70,140,255,.5)'], [0.5, 'rgba(40,110,255,.14)'], [1, 'rgba(30,90,255,0)']]), transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending, opacity: 0 }));
halo.position.set(0, 2.1, -2.2); halo.renderOrder = 2; scene.add(halo);

/* ---------- animation ---------- */
function kf(p, K) { if (p <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (p <= K[i][0]) { const a = K[i - 1], b = K[i]; return a[1] + (b[1] - a[1]) * smooth((p - a[0]) / (b[0] - a[0])); } return K[K.length - 1][1]; }
const V = new T.Vector3();
let t0 = -1, shown = false;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = Math.max(28, 2 * Math.atan(Math.tan(10 * Math.PI / 180) / camera.aspect) * 180 / Math.PI);
  camera.updateProjectionMatrix();
}
function frame(cx, ty, drop, pitch, fitW, fitH) {    // place the camera so a box of fitW x fitH around the target fills the view
  const A = camera.aspect, th = Math.tan(camera.fov * Math.PI / 360), tw = th * A, d = Math.max(fitW / (2 * tw), fitH / (2 * th));
  V.set(cx, ty + drop * 2 * d * th, 0);
  camera.position.set(cx, V.y + d * Math.sin(pitch), d * Math.cos(pitch));
  camera.lookAt(V);
  camera.near = Math.max(0.2, d * 0.25); camera.far = d * 2.5 + 30; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  if (!shown) { shown = true; canvas.classList.add('on'); if (!HERO) sceneEl.classList.add('live'); }
}
function updateHero(p, t) {
  if (t0 < 0) t0 = t;
  const A = camera.aspect, port = A < 0.9;
  const tease = reduce ? 1 : out(clamp((t - t0 - 0.3) / 1.8, 0, 1));
  const open = Math.max(tease * 0.3, io(seg(p, 0.04, 0.36)) * 1.9);
  const k = clamp(open / 0.75, 0, 1);
  const sway = reduce ? 0 : Math.sin(t * 0.6) * 0.012, bob = reduce ? 0 : Math.sin(t * 1.2) * 0.022;
  const yawEnd = port ? 0.1 : 0.2;
  const yaw = kf(p, [[0, -0.62], [0.36, -0.26], [0.48, 0], [0.56, 0], [0.76, yawEnd], [1, yawEnd + 0.06]]) + sway;
  const lx = kf(p, [[0.56, 0], [0.76, port ? -0.22 : -0.95]]);
  const q = io(seg(p, 0.56, 0.76)), a = io(seg(p, 0.82, 0.92));
  sets.forEach(s => {
    s.pivot.rotation.x = -open;
    s.lap.rotation.y = yaw; s.lap.position.x = lx;
    s.ph.visible = q > 0.002;
    if (port) { s.ph.position.set(lerp(2.7, 0.98, q), 0.86 + bob, 1.3); s.ph.rotation.set(lerp(0.25, 0, q), lerp(-3.3, -0.32, q) - a * 0.1, lerp(0.3, 0.04, q)); s.ph.scale.setScalar(1); }
    else { s.ph.position.set(lerp(4.5, 1.62, q), 1.1 + bob, 0.6); s.ph.rotation.set(lerp(0.3, 0, q), lerp(-3.5, -0.42, q) - a * 0.12, lerp(0.35, 0.05, q)); s.ph.scale.setScalar(1.36); }
    s.sB.visible = s.pB.visible = a > 0.003;
  });
  M.siteA.emissiveIntensity = M.siteB.emissiveIntensity = k;
  M.chrome.color.setScalar(k);
  M.siteB.opacity = M.appB.opacity = a;
  glowLight.intensity = k * 1.8;
  pool.material.opacity = k * 0.5; pool.position.x = lx; halo.material.opacity = k * 0.55; halo.position.x = lx * 0.5;
  tex.site.offset.y = SITE_TOP - io(seg(p, 0.38, 0.58)) * SITE_TOP * 0.82;
  const fitW = port ? kf(p, [[0, 4.4], [0.36, 3.9], [0.5, 3.5], [0.58, 3.6], [0.76, 4.0], [1, 3.8]]) : kf(p, [[0, 6.9], [0.36, 5.4], [0.5, 5.0], [0.58, 5.2], [0.76, 6.5], [1, 6.2]]);
  const fitH = port ? 3 : kf(p, [[0, 3.5], [0.36, 4.3], [0.5, 4.2], [0.76, 4.4], [1, 4.3]]);
  const pitch = kf(p, [[0, 0.27], [0.36, 0.17], [0.5, 0.1], [0.76, 0.15], [1, 0.13]]);
  const ty = kf(p, [[0, 0.2], [0.36, 0.95], [0.5, 1.05], [1, 0.98]]);
  const cx = kf(p, [[0.56, 0], [0.76, port ? 0 : 0.2]]);
  const drop = port ? kf(p, [[0, 0.2], [0.14, 0.1], [0.36, -0.08], [1, -0.08]]) : kf(p, [[0, 0.2], [0.14, 0.12], [0.36, -0.1], [1, -0.1]]);
  frame(cx, ty, drop, pitch, fitW, fitH);
}

/* ---------- one device per service page ----------
   p: how far the figure has travelled through the viewport (0 enters at the bottom, 0.5 centred, 1 gone at the top)
   px, py: pointer or finger inside the figure, -1..1, already damped by the page */
function pose(port) {
  const phone = { ph: [0, 1.2, 0, 1.5], fitW: 1.62, fitH: 2.9, ty: 1.1, pitch: 0.05, drop: 0, cx: 0 };
  if (SHOT === 'web') return { lap: [0, -0.28], fitW: port ? 3.7 : 4.3, fitH: port ? 3 : 2.95, ty: 0.95, pitch: 0.15, drop: -0.03, cx: 0 };
  if (SHOT === 'local') return { lap: [0, 0.28], fitW: port ? 3.7 : 4.3, fitH: port ? 3 : 2.95, ty: 0.95, pitch: 0.15, drop: -0.03, cx: 0 };
  if (SHOT === 'app') return Object.assign({ pyaw: -0.3 }, phone);
  if (SHOT === 'auto') return Object.assign({ pyaw: 0.3 }, phone);
  if (SHOT === 'ads' && port) return Object.assign({ pyaw: -0.28 }, phone);
  return { lap: [port ? -0.22 : -0.95, 0.22], ph: port ? [0.98, 0.86, 1.3, 1] : [1.62, 1.1, 0.6, 1.36], pyaw: port ? -0.4 : -0.52, fitW: port ? 4.0 : 6.3, fitH: port ? 3 : 3.7, ty: 0.98, pitch: 0.14, drop: -0.06, cx: port ? 0 : 0.2 };
}
/* the moments inside each loop when the screen is moving; in between it is repainted once and left alone */
const BUSY = { app: [[3, 3.5], [4.2, 4.5], [5, 5.3], [5.35, 5.85], [8.7, 9.2]], auto: [[0.5, 0.85], [1.3, 2.85], [4.3, 4.65], [5, 6.35], [7.2, 7.65], [12.5, 13.25]], ads: [[0, 3], [4.6, 5.05], [5.3, 5.85], [10.8, 11.65]] }[SHOT] || [];
let seqKey = '';
function updateShot(p, t, px, py) {
  if (!ready) return;
  if (POSTER) { p = 0.5; t = 0; px = py = 0; }
  if (t0 < 0) t0 = t;
  px = px || 0; py = py || 0;
  const port = camera.aspect < 0.9, P = pose(port), still = reduce || POSTER;
  const e = io(seg(p, 0.02, 0.4)), leave = seg(p, 0.62, 1);                      // arriving, leaving
  const sway = still ? 0 : Math.sin(t * 0.6) * 0.014, bob = still ? 0 : Math.sin(t * 1.2) * 0.02;
  const turn = (e - 1) * 0.5 + leave * 0.22 + sway + px * 0.3;
  sets.forEach(s => {
    s.lap.visible = !!P.lap; s.ph.visible = !!P.ph; s.sB.visible = s.pB.visible = false; s.sC.visible = !!tex.chrome;
    if (P.lap) { s.pivot.rotation.x = -lerp(1.0, 1.9, e); s.lap.position.x = P.lap[0]; s.lap.rotation.y = P.lap[1] + turn * (P.ph ? 0.5 : 1); }
    if (P.ph) { s.ph.position.set(P.ph[0], P.ph[1] + bob - (1 - e) * 0.18, P.ph[2]); s.ph.rotation.set((1 - e) * 0.16 - py * 0.05, P.pyaw + turn * 1.25, (1 - e) * 0.08); s.ph.scale.setScalar(P.ph[3]); }
  });
  M.siteA.emissiveIntensity = 1; M.chrome.color.setScalar(1);
  glowLight.intensity = P.lap ? 1.8 : 0;
  pool.material.opacity = P.lap ? 0.5 : 0.28; pool.position.x = P.lap ? P.lap[0] : 0; halo.material.opacity = 0.5; halo.position.x = P.lap ? P.lap[0] * 0.5 : 0;
  if (SCROLLS) {                                     // the sample site scrolls by itself: down, pause, back up
    const c = POSTER ? 0 : ((t - t0) % 15) / 15, sc = SHOT === 'local' ? 0.7 + (still ? 0 : Math.sin(t * 0.35) * 0.1) : c < 0.2 ? 0 : c < 0.47 ? io((c - 0.2) / 0.27) : c < 0.67 ? 1 : c < 0.94 ? 1 - io((c - 0.67) / 0.27) : 0;
    tex.site.offset.y = SITE_TOP - sc * SITE_TOP * 0.82;
  }
  if (SEQ) {                                         // the phone screen plays its loop; repaint only when the picture changes
    const tt = still ? SEQ[2] : (SEQ[2] + (t - t0)) % SEQ[1], busy = BUSY.some(w => tt >= w[0] && tt <= w[1]);
    const key = busy ? 'b' + Math.floor(tt * 24) : 'i' + BUSY.filter(w => tt > w[1]).length;
    if (key !== seqKey) { seqKey = key; seqT = tt; tex.app.userData.paint(tt); }
  }
  frame(P.cx, P.ty, P.drop, P.pitch - py * 0.035, P.fitW, P.fitH);
  if (POSTER) window.__posterReady = true;
}
const update = HERO ? updateHero : updateShot;
resize();
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else addEventListener('resize', resize);
window.__scene = { update, resize };
})();

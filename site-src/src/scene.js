/* VincialMedia hero scene. Real-time 3D laptop + phone, three.js r160 (global THREE).
   The page's inline script owns scroll progress and calls window.__scene.update(p, t). */
(function () {
'use strict';
const T = window.THREE, canvas = document.getElementById('gl'), sceneEl = document.getElementById('scene'), stage = document.getElementById('stage');
if (!T || !canvas) { if (sceneEl) sceneEl.classList.add('nogl'); return; }
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { sceneEl.classList.add('nogl'); return; }
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
const COOL = [[0.2, 0.2, 0.7, '122,200,255'], [0.85, 0.25, 0.6, '0,113,227'], [0.75, 0.9, 0.7, '255,170,120'], [0.1, 0.95, 0.55, '255,221,150']];
const WARM = [[0.2, 0.15, 0.7, '255,214,170'], [0.9, 0.3, 0.6, '255,140,105'], [0.5, 1, 0.7, '255,196,120']];
const MINT = [[0.2, 0.2, 0.7, '170,236,214'], [0.9, 0.3, 0.6, '70,180,160'], [0.4, 1, 0.7, '190,225,255']];

function drawSite(x) {
  x.fillStyle = '#fbfbfd'; x.fillRect(0, 0, SW_PX, SITE_H);
  let y = CH;
  tx(x, 'yourbrand', 90, y + 64, 700, 32, INK, 'left', -1);
  ['Collection', 'Stories', 'Stores', 'Contact'].forEach((s, i) => tx(x, s, 720 + i * 150, y + 62, 500, 22, '#424245'));
  x.fillStyle = INK; rr(x, 1340, y + 28, 170, 54, 27); x.fill(); tx(x, 'Shop now', 1425, y + 63, 600, 21, '#fff', 'center');
  tx(x, 'New this season', 90, 300, 600, 25, BLUE);
  tx(x, 'Made for people', 86, 420, 700, 104, INK, 'left', -4.5);
  tx(x, 'who notice.', 86, 532, 700, 104, INK, 'left', -4.5);
  tx(x, 'Quiet design, honest materials and', 90, 612, 400, 28, MUTE);
  tx(x, 'delivery across Switzerland in 48 hours.', 90, 652, 400, 28, MUTE);
  x.fillStyle = BLUE; rr(x, 90, 712, 220, 68, 34); x.fill(); tx(x, 'Shop now', 200, 755, 600, 25, '#fff', 'center');
  tx(x, 'Our story  ›', 350, 755, 500, 25, BLUE);
  art(x, 850, 190, 660, 760, 48, '#dfeeff', COOL);
  orb(x, 1215, 560, 205, '#ffffff', '#cfe3ff', '#5f93e6');
  orb(x, 1010, 760, 86, '#fff6ea', '#ffd0a6', '#e98952');
  card(x, 770, 770, 310, 150, 30);
  x.lineWidth = 12; x.strokeStyle = '#e5e5ea'; x.beginPath(); x.arc(845, 845, 40, 0, 7); x.stroke();
  x.strokeStyle = '#30b85a'; x.lineCap = 'round'; x.beginPath(); x.arc(845, 845, 40, -1.57, 4.5); x.stroke();
  tx(x, '100', 910, 842, 700, 40, INK, 'left', -1); tx(x, 'Speed score', 910, 876, 500, 20, MUTE);
  /* below the fold */
  tx(x, 'Featured', 90, 1180, 700, 60, INK, 'left', -2);
  tx(x, 'View all  ›', 1510, 1176, 500, 24, BLUE, 'right');
  [[90, COOL, '#dfeeff', 'Travel flask', 'CHF 49'], [580, WARM, '#fff0e2', 'Table lamp', 'CHF 129'], [1070, MINT, '#e2f6ee', 'Linen throw', 'CHF 89']].forEach((c, i) => {
    art(x, c[0], 1230, 440, 500, 40, c[2], c[1]);
    orb(x, c[0] + 220, 1470, 120 - i * 8, '#ffffff', i === 1 ? '#ffd9b8' : i === 2 ? '#c8ecdf' : '#cfe3ff', i === 1 ? '#e58a52' : i === 2 ? '#3fa58e' : '#5f93e6');
    tx(x, c[3], c[0] + 6, 1790, 600, 30, INK); tx(x, c[4], c[0] + 6, 1830, 400, 24, MUTE);
  });
  x.fillStyle = INK; x.fillRect(0, 1920, SW_PX, 580);
  tx(x, 'Built to last.', 90, 2130, 700, 96, '#f5f5f7', 'left', -4);
  tx(x, 'Made nearby.', 90, 2240, 700, 96, '#86868b', 'left', -4);
  x.fillStyle = BLUE; rr(x, 90, 2310, 250, 68, 34); x.fill(); tx(x, 'Find a store', 215, 2353, 600, 24, '#fff', 'center');
}
function drawChrome(x) {
  x.clearRect(0, 0, SW_PX, VH);
  x.fillStyle = '#e9e9ee'; x.fillRect(0, 0, SW_PX, CH);
  x.fillStyle = '#d2d2d7'; x.fillRect(0, CH - 1, SW_PX, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(44 + i * 34, CH / 2, 11, 0, 7); x.fill(); });
  x.fillStyle = '#fff'; rr(x, 440, 14, 720, 44, 22); x.fill();
  tx(x, 'yourbrand.ch', 800, 44, 500, 22, '#424245', 'center');
}
function drawDash(x) {
  x.fillStyle = '#f5f5f7'; x.fillRect(0, 0, SW_PX, VH);
  x.fillStyle = '#fff'; x.fillRect(0, CH, 250, VH);
  tx(x, 'yourbrand', 40, CH + 62, 700, 28, INK, 'left', -1);
  ['Overview', 'Campaigns', 'Creatives', 'Audiences', 'Reports'].forEach((s, i) => {
    if (i === 1) { x.fillStyle = '#eaf3ff'; rr(x, 24, CH + 152, 202, 50, 12); x.fill(); }
    tx(x, s, 44, CH + 124 + i * 62, i === 1 ? 600 : 500, 22, i === 1 ? BLUE : '#424245');
  });
  tx(x, 'Campaigns', 290, CH + 78, 700, 46, INK, 'left', -1.5);
  x.fillStyle = '#e8e8ed'; rr(x, 560, CH + 44, 150, 40, 20); x.fill(); tx(x, 'Sample data', 635, CH + 71, 500, 18, MUTE, 'center');
  [['Leads', '248', '+18%'], ['Cost per lead', 'CHF 21', '−12%'], ['Click rate', '4.6%', '+0.8'], ['Spend', 'CHF 5’210', 'on plan']].forEach((k, i) => {
    const X = 290 + i * 322; card(x, X, CH + 120, 300, 150, 24);
    tx(x, k[0], X + 26, CH + 166, 500, 21, MUTE); tx(x, k[1], X + 26, CH + 228, 700, 46, INK, 'left', -1.5);
    x.fillStyle = '#e3f6e8'; rr(x, X + 196, CH + 142, 84, 34, 17); x.fill(); tx(x, k[2], X + 238, CH + 165, 600, 17, '#1f8f43', 'center');
  });
  card(x, 290, CH + 300, 870, 640, 28);
  tx(x, 'Leads per week', 322, CH + 356, 600, 26, INK);
  const pts = [22, 26, 24, 33, 38, 36, 47, 52, 58, 71, 78, 92], X0 = 340, Y0 = CH + 880, WW = 770, HH = 440;
  x.strokeStyle = '#ececf0'; x.lineWidth = 2; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(X0, Y0 - i * HH / 4); x.lineTo(X0 + WW, Y0 - i * HH / 4); x.stroke(); }
  const px = i => X0 + i * WW / (pts.length - 1), py = v => Y0 - v / 100 * HH;
  x.beginPath(); x.moveTo(px(0), py(pts[0])); for (let i = 1; i < pts.length; i++) { const mx = (px(i - 1) + px(i)) / 2; x.bezierCurveTo(mx, py(pts[i - 1]), mx, py(pts[i]), px(i), py(pts[i])); }
  x.strokeStyle = BLUE; x.lineWidth = 6; x.lineCap = 'round'; x.stroke();
  x.lineTo(px(pts.length - 1), Y0); x.lineTo(px(0), Y0); x.closePath();
  const g = x.createLinearGradient(0, Y0 - HH, 0, Y0); g.addColorStop(0, 'rgba(0,113,227,.28)'); g.addColorStop(1, 'rgba(0,113,227,0)'); x.fillStyle = g; x.fill();
  x.fillStyle = '#fff'; x.strokeStyle = BLUE; x.lineWidth = 6; x.beginPath(); x.arc(px(11), py(92), 11, 0, 7); x.fill(); x.stroke();
  card(x, 1190, CH + 300, 372, 640, 28);
  tx(x, 'Best creative', 1220, CH + 356, 600, 26, INK);
  art(x, 1220, CH + 384, 312, 300, 24, '#dfeeff', COOL); orb(x, 1376, CH + 524, 84, '#fff', '#cfe3ff', '#5f93e6');
  [['Video A', 0.92], ['Carousel B', 0.64], ['Static C', 0.38]].forEach((b, i) => {
    const Y = CH + 736 + i * 66; tx(x, b[0], 1220, Y, 500, 20, '#424245');
    x.fillStyle = '#ececf0'; rr(x, 1220, Y + 14, 312, 12, 6); x.fill(); x.fillStyle = i ? '#9cc4f5' : BLUE; rr(x, 1220, Y + 14, 312 * b[1], 12, 6); x.fill();
  });
}
const PW_PX = 720, PH_PX = 1558;
function drawApp(x) {
  x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, PW_PX, PH_PX);
  tx(x, '9:30', 64, 82, 600, 30, '#fff');
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3; rr(x, 596, 56, 54, 28, 9); x.stroke(); x.fillStyle = '#fff'; rr(x, 601, 61, 36, 18, 5); x.fill();
  tx(x, 'Tuesday, 24 November', 48, 190, 500, 26, '#8e8e93');
  tx(x, 'Good morning', 46, 258, 700, 62, '#fff', 'left', -2.5);
  const g = x.createLinearGradient(40, 310, 680, 660); g.addColorStop(0, '#0a84ff'); g.addColorStop(1, '#5e5ce6');
  x.fillStyle = g; rr(x, 40, 310, 640, 350, 48); x.fill();
  x.save(); rr(x, 40, 310, 640, 350, 48); x.clip(); blob(x, 620, 340, 300, '255,255,255', 0.28); blob(x, 100, 680, 260, '120,220,255', 0.35); x.restore();
  tx(x, 'Next booking', 84, 388, 500, 26, 'rgba(255,255,255,.85)');
  tx(x, 'Today · 14:30', 82, 468, 700, 60, '#fff', 'left', -2);
  tx(x, 'Studio Zürich West', 84, 516, 500, 28, 'rgba(255,255,255,.9)');
  x.fillStyle = '#fff'; rr(x, 84, 560, 200, 64, 32); x.fill(); tx(x, 'Check in', 184, 601, 600, 25, '#0a3fa8', 'center');
  tx(x, 'Quick actions', 48, 748, 600, 30, '#fff');
  [['Book', '#30d158'], ['Pay', '#ff9f0a'], ['Chat', '#64d2ff'], ['Rewards', '#ff6482']].forEach((a, i) => {
    const X = 40 + (i % 2) * 328, Y = 784 + Math.floor(i / 2) * 200;
    x.fillStyle = '#1c1c1e'; rr(x, X, Y, 312, 180, 40); x.fill();
    const gg = x.createRadialGradient(X + 60, Y + 54, 2, X + 70, Y + 66, 36); gg.addColorStop(0, '#fff'); gg.addColorStop(0.25, a[1]); gg.addColorStop(1, a[1]);
    x.fillStyle = gg; x.beginPath(); x.arc(X + 70, Y + 66, 30, 0, 7); x.fill();
    tx(x, a[0], X + 40, Y + 146, 600, 28, '#fff');
  });
  tx(x, 'Recent', 48, 1240, 600, 30, '#fff');
  [['Yoga flow · 60 min', 'Yesterday'], ['Sauna pass', 'Sunday']].forEach((r, i) => {
    const Y = 1268 + i * 72; x.fillStyle = '#1c1c1e'; rr(x, 40, Y, 640, 62, 20); x.fill();
    tx(x, r[0], 66, Y + 41, 500, 24, '#fff'); tx(x, r[1], 654, Y + 41, 400, 22, '#8e8e93', 'right');
  });
  x.fillStyle = 'rgba(44,44,46,.96)'; rr(x, 40, 1424, 640, 100, 50); x.fill();
  x.fillStyle = '#0a84ff'; rr(x, 56, 1438, 150, 72, 36); x.fill(); tx(x, 'Home', 131, 1483, 600, 24, '#fff', 'center');
  ['Classes', 'Wallet', 'Profile'].forEach((s, i) => tx(x, s, 290 + i * 150, 1483, 500, 23, '#aeaeb2', 'center'));
}
function drawAd(x) {
  x.fillStyle = '#fff'; x.fillRect(0, 0, PW_PX, PH_PX);
  tx(x, '9:30', 64, 82, 600, 30, INK);
  x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 3; rr(x, 596, 56, 54, 28, 9); x.stroke(); x.fillStyle = INK; rr(x, 601, 61, 36, 18, 5); x.fill();
  tx(x, 'For you', 46, 196, 700, 54, INK, 'left', -2);
  const av = x.createLinearGradient(46, 244, 118, 316); av.addColorStop(0, '#7ac8ff'); av.addColorStop(1, BLUE);
  x.fillStyle = av; x.beginPath(); x.arc(82, 280, 36, 0, 7); x.fill();
  tx(x, 'yourbrand', 138, 274, 600, 27, INK); tx(x, 'Sponsored', 138, 308, 400, 22, MUTE);
  art(x, 0, 340, 720, 800, 0, '#dfeeff', COOL);
  orb(x, 430, 700, 220, '#ffffff', '#cfe3ff', '#5f93e6'); orb(x, 190, 930, 92, '#fff6ea', '#ffd0a6', '#e98952');
  tx(x, 'Spring drop', 44, 452, 700, 84, '#0b2a55', 'left', -3.5);
  x.fillStyle = '#0b2a55'; rr(x, 46, 486, 268, 60, 30); x.fill(); tx(x, '−20% this week', 180, 525, 600, 24, '#fff', 'center');
  x.fillStyle = '#f2f2f7'; x.fillRect(0, 1140, 720, 96); tx(x, 'Shop now', 46, 1198, 600, 28, INK); tx(x, '›', 676, 1200, 500, 36, MUTE, 'right');
  x.strokeStyle = INK; x.lineWidth = 4.5; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); x.moveTo(74, 1318); x.bezierCurveTo(40, 1288, 52, 1262, 74, 1280); x.bezierCurveTo(96, 1262, 108, 1288, 74, 1318); x.stroke();
  x.beginPath(); x.arc(170, 1290, 24, 0.6, 6.4); x.lineTo(150, 1322); x.stroke();
  x.beginPath(); x.moveTo(238, 1276); x.lineTo(296, 1268); x.lineTo(270, 1320); x.lineTo(262, 1294); x.closePath(); x.stroke();
  tx(x, '1’204 likes', 46, 1384, 600, 25, INK);
  tx(x, 'yourbrand', 46, 1426, 600, 25, INK); tx(x, 'New colours, made in small batches.', 190, 1426, 400, 25, INK);
  x.fillStyle = '#e5e5ea'; x.fillRect(0, 1470, 720, 2);
  x.fillStyle = '#ffd0a6'; x.beginPath(); x.arc(82, 1530, 36, 0, 7); x.fill(); tx(x, 'studio.nord', 138, 1540, 600, 27, INK);
}
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.userData.paint = () => { x.save(); draw(x); x.restore(); t.needsUpdate = true; };
  t.userData.paint();
  return t;
}
const tex = { site: ctex(SW_PX, SITE_H, drawSite), chrome: ctex(SW_PX, VH, drawChrome), dash: ctex(SW_PX, VH, drawDash), app: ctex(PW_PX, PH_PX, drawApp), ad: ctex(PW_PX, PH_PX, drawAd) };
const SITE_TOP = 1 - VH / SITE_H;
tex.site.repeat.set(1, VH / SITE_H); tex.site.offset.y = SITE_TOP;
if (document.fonts && document.fonts.load) {
  Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(w + ' 24px Inter'))).then(() => { Object.keys(tex).forEach(k => tex[k].userData.paint()); }).catch(() => {});
}

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
  siteA: lit(tex.site, 2), siteB: lit(tex.dash, 3, true),
  chrome: decal(new T.MeshBasicMaterial({ map: tex.chrome, transparent: true, toneMapped: false, depthWrite: false }), 4),
  appA: lit(tex.app, 2), appB: lit(tex.ad, 3, true)
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const io = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const out = t => 1 - Math.pow(1 - t, 3);
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
function update(p, t) {
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

  const th = Math.tan(camera.fov * Math.PI / 360), tw = th * A;
  const fitW = port ? kf(p, [[0, 4.4], [0.36, 3.9], [0.5, 3.5], [0.58, 3.6], [0.76, 4.0], [1, 3.8]]) : kf(p, [[0, 6.9], [0.36, 5.4], [0.5, 5.0], [0.58, 5.2], [0.76, 6.5], [1, 6.2]]);
  const fitH = port ? 3 : kf(p, [[0, 3.5], [0.36, 4.3], [0.5, 4.2], [0.76, 4.4], [1, 4.3]]);
  const d = Math.max(fitW / (2 * tw), fitH / (2 * th));
  const pitch = kf(p, [[0, 0.27], [0.36, 0.17], [0.5, 0.1], [0.76, 0.15], [1, 0.13]]);
  const ty = kf(p, [[0, 0.2], [0.36, 0.95], [0.5, 1.05], [1, 0.98]]);
  const cx = kf(p, [[0.56, 0], [0.76, port ? 0 : 0.2]]);
  const drop = port ? kf(p, [[0, 0.2], [0.14, 0.1], [0.36, -0.08], [1, -0.08]]) : kf(p, [[0, 0.2], [0.14, 0.12], [0.36, -0.1], [1, -0.1]]);
  V.set(cx, ty + drop * 2 * d * th, 0);
  camera.position.set(cx, V.y + d * Math.sin(pitch), d * Math.cos(pitch));
  camera.lookAt(V);
  camera.near = Math.max(0.2, d * 0.25); camera.far = d * 2.5 + 30; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  if (!shown) { shown = true; canvas.classList.add('on'); }
}
resize();
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else addEventListener('resize', resize);
window.__scene = { update, resize };
})();

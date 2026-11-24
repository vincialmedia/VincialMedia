// Shared by the build (Node) and the browser runtime. Prices live here and in pages/api/offerte.ts.
export const PRICE = { app: [9800, 19500, 39000], web: [1900, 3900, 7900], ads: [590, 1190, 2400], auto: [1900, 3900, 6900] };
export const MONTHLY = { auto: [149, 249, 399] };
export const RECUR = { ads: true };
export const ORDER = ['s', 'm', 'l'];
export const SVCS = ['web', 'app', 'ads', 'auto'];
export const SVCPAGE = { app: 'app-entwicklung', web: 'webdesign', ads: 'google-ads', auto: 'ki-automation' };

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = n => 'CHF ' + String(n).replace(/\B(?=(\d{3})+$)/g, '’');

/* F is the slice of copy the package builder needs: { finder, lv, tiers } */
export const priceText = (F, k, i) => fmt(PRICE[k][i]) + (RECUR[k] ? F.finder.per : MONTHLY[k] ? ' + ' + fmt(MONTHLY[k][i]) + F.finder.per : '');

/* clean URLs: German at the root, English under /en */
export const url = (slug, lang) => { const b = lang === 'en' ? '/en' : ''; return slug === 'home' ? (b || '/') : `${b}/${slug}`; };

export function chipsHtml(F, sel) {
  return SVCS.map(k => `<button type="button" class="chip" data-k="${k}" aria-pressed="${!!sel[k]}">${esc(F.finder.svc[k])}</button>`).join('');
}
export function rowsHtml(F, sel, open) {
  const f = F.finder;
  return SVCS.filter(k => sel[k]).map(k => {
    const i = ORDER.indexOf(sel[k]);
    return `<div class="frow"><div class="frh"><strong>${esc(f.svc[k])}</strong><span>${esc(f.time[k][i])}</span></div><div class="chips" role="group" aria-label="${esc(f.svc[k])}">${ORDER.map(s => `<button type="button" class="chip sm" data-svc="${k}" data-size="${s}" aria-pressed="${s === sel[k]}">${esc(f.size[s])}</button>`).join('')}</div><p>${esc(F.tiers[k][i])}</p><details class="fd" data-row="${k}"${open && open.has(k) ? ' open' : ''}><summary>${esc(F.lv.more)}</summary><ul>${F.lv[k][i].inc.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details></div>`;
  }).join('') || `<p class="fempty">${esc(f.empty)}</p>`;
}
export function totals(F, sel) {
  const f = F.finder; let once = 0, month = 0; const lines = [];
  SVCS.filter(k => sel[k]).forEach(k => {
    const i = ORDER.indexOf(sel[k]), name = f.svc[k] + ' · ' + f.size[sel[k]];
    if (RECUR[k]) { month += PRICE[k][i]; lines.push([name, fmt(PRICE[k][i]) + f.per]); return; }
    once += PRICE[k][i]; lines.push([name, fmt(PRICE[k][i])]);
    if (MONTHLY[k]) { month += MONTHLY[k][i]; lines.push([f.ops, fmt(MONTHLY[k][i]) + f.per]); }
  });
  return { once, month, lines, html: lines.map(l => `<li><span>${esc(l[0])}</span><b>${esc(l[1])}</b></li>`).join('') };
}

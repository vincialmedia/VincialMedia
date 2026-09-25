// Minimal, robust HTML email layout (tables + inline styles) and helpers.

export function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const C = { bg: "#fffaf3", card: "#ffffff", text: "#1e1a16", muted: "#6b6259", primary: "#c73e1d", border: "#e9dfd2", soft: "#f4ede3" };

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:999px;background:${C.primary}"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}

export function p(html: string): string {
  return `<p style="margin:0 0 14px;line-height:1.55">${html}</p>`;
}

export function h1(text: string): string {
  return `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(text)}</h1>`;
}

export function box(html: string): string {
  return `<div style="background:${C.soft};border-radius:12px;padding:14px 16px;margin:0 0 16px">${html}</div>`;
}

export function muted(html: string): string {
  return `<p style="margin:0 0 10px;color:${C.muted};font-size:13px;line-height:1.5">${html}</p>`;
}

export type Row = { label: string; value: string; strong?: boolean; muted?: boolean };

export function table(rows: Row[]): string {
  const tr = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;${r.muted ? `color:${C.muted};font-size:13px;` : ""}${r.strong ? "font-weight:bold;font-size:16px;border-top:1px solid " + C.border + ";padding-top:10px;" : ""}">${r.label}</td><td style="padding:6px 0;text-align:right;white-space:nowrap;${r.muted ? `color:${C.muted};font-size:13px;` : ""}${r.strong ? "font-weight:bold;font-size:16px;border-top:1px solid " + C.border + ";padding-top:10px;" : ""}">${r.value}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${tr}</table>`;
}

export function layout({ preheader, body, footer }: { preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.text};font-family:Arial,Helvetica,sans-serif;font-size:15px">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><div style="font-size:28px;font-weight:800;color:${C.primary};line-height:1">wunch</div><div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${C.muted}">work + lunch</div></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:24px 22px">${body}</td></tr>
<tr><td style="padding:16px 6px;color:${C.muted};font-size:12px;line-height:1.5">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Plain-text version: lines joined, empty strings removed at the edges. */
export function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((x) => x !== false && x !== null && x !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

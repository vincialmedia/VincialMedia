import type { NextApiRequest, NextApiResponse } from "next";

/*
  Quote requests from the package builder on the homepage.
  Sends the lead to Vincent and a confirmation to the customer through Resend.
  Environment: RESEND_API_KEY (required), RESEND_FROM, LEAD_TO, LEAD_WEBHOOK_URL (all optional).
  Prices must match site/src/shared.js.
*/

const PRICE: Record<string, number[]> = { app: [9800, 19500, 39000], web: [1900, 3900, 7900], ads: [590, 1190, 2400], auto: [1900, 3900, 6900] };
const MONTHLY: Record<string, number[]> = { auto: [149, 249, 399] };
const RECUR: Record<string, boolean> = { ads: true };
const SIZES = ["s", "m", "l"];
const NAMES: Record<string, Record<string, string>> = {
  de: { web: "Website", app: "App", ads: "Werbung", auto: "KI-Automation", s: "Klein", m: "Mittel", l: "Gross", ops: "Betrieb KI-Assistent", per: " pro Monat" },
  en: { web: "Website", app: "App", ads: "Ads", auto: "AI automation", s: "Small", m: "Medium", l: "Large", ops: "Running the AI assistant", per: " a month" },
};

const fmt = (n: number) => "CHF " + String(n).replace(/\B(?=(\d{3})+$)/g, "’");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/* best effort per instance: at most 5 requests per address in 10 minutes */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

async function send(payload: Record<string, unknown>) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method" }); }
  const b = (typeof req.body === "object" && req.body) || {};

  // bots: the hidden field is filled, or the form was sent faster than a person can type
  if (str(b.website, 200) || (typeof b.ms === "number" && b.ms < 800)) return res.status(200).json({ ok: true });

  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ ok: false, error: "rate" });

  const lang = b.lang === "en" ? "en" : "de", N = NAMES[lang];
  const name = str(b.name, 100), email = str(b.email, 200), phone = str(b.phone, 40), msg = str(b.msg, 2000), page = str(b.page, 120);
  const services = (Array.isArray(b.services) ? b.services : [])
    .filter((s: { k?: string; size?: string }) => s && PRICE[s.k as string] && SIZES.includes(s.size as string))
    .filter((s: { k: string }, i: number, a: { k: string }[]) => a.findIndex((x) => x.k === s.k) === i)
    .slice(0, 4) as { k: string; size: string }[];
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !services.length) return res.status(400).json({ ok: false, error: "invalid" });
  if (!process.env.RESEND_API_KEY) { console.error("offerte: RESEND_API_KEY missing"); return res.status(502).json({ ok: false, error: "config" }); }

  let once = 0, month = 0;
  const lines: [string, string][] = [];
  for (const s of services) {
    const i = SIZES.indexOf(s.size), label = `${N[s.k]} · ${N[s.size]}`;
    if (RECUR[s.k]) { month += PRICE[s.k][i]; lines.push([label, fmt(PRICE[s.k][i]) + N.per]); continue; }
    once += PRICE[s.k][i]; lines.push([label, fmt(PRICE[s.k][i])]);
    if (MONTHLY[s.k]) { month += MONTHLY[s.k][i]; lines.push([N.ops, fmt(MONTHLY[s.k][i]) + N.per]); }
  }
  if (once) lines.push([lang === "en" ? "One-off" : "Einmalig", fmt(once)]);
  if (month) lines.push([lang === "en" ? "Per month" : "Pro Monat", fmt(month)]);

  const from = process.env.RESEND_FROM || "VincialMedia <no-reply@vincialmedia.com>";
  const to = process.env.LEAD_TO || "vincent@vincialmedia.com";
  const row = (k: string, v: string) => `<tr><td style="padding:6px 16px 6px 0;color:#6e6e73;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`;
  const table = (rows: [string, string][]) => `<table style="border-collapse:collapse;font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif">${rows.map(([k, v]) => row(k, v)).join("")}</table>`;
  const summary = services.map((s) => `${N[s.k]} ${N[s.size]}`).join(", ");

  try {
    await send({
      from, to: [to], reply_to: email,
      subject: `Offertanfrage: ${summary} (${name})`,
      html: `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1d1f"><h2 style="margin:0 0 12px">Neue Offertanfrage</h2>${table([["Name", name], ["E-Mail", email], ["Telefon", phone || "–"], ["Sprache", lang], ["Seite", page || "/"]])}<h3 style="margin:20px 0 8px">Auswahl</h3>${table(lines)}<h3 style="margin:20px 0 8px">Nachricht</h3><p style="white-space:pre-wrap;margin:0">${esc(msg || "–")}</p><p style="color:#6e6e73;margin-top:24px">Antworten geht direkt an ${esc(email)}. Versprochen ist eine Offerte innert zwei Arbeitstagen.</p></div>`,
      text: [`Neue Offertanfrage`, `Name: ${name}`, `E-Mail: ${email}`, `Telefon: ${phone || "-"}`, `Sprache: ${lang}`, `Seite: ${page || "/"}`, ``, ...lines.map((l) => l.join(": ")), ``, msg || "-"].join("\n"),
    });
  } catch (e) {
    console.error("offerte: lead mail failed", e instanceof Error ? e.message : e);
    return res.status(502).json({ ok: false, error: "send" });
  }

  const greet = lang === "en" ? `Hello ${name}` : `Guten Tag ${name}`;
  const body = lang === "en"
    ? ["Thanks for your request. Here is what you picked:", "You will have a written quote with price and launch date within two working days. If you want to add anything, just reply to this email."]
    : ["Danke für Ihre Anfrage. Das haben Sie gewählt:", "Innert zwei Arbeitstagen erhalten Sie eine schriftliche Offerte mit Preis und Termin. Wenn Sie etwas ergänzen möchten, antworten Sie einfach auf diese E-Mail."];
  const sign = "Vincent Hänggi\nVincialMedia · Brandstrasse 21 · 8952 Schlieren\nvincialmedia.com";
  try {
    await send({
      from, to: [email], reply_to: to,
      subject: lang === "en" ? "Your quote request at VincialMedia" : "Ihre Offertanfrage bei VincialMedia",
      html: `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1d1f;max-width:560px"><p>${esc(greet)}</p><p>${esc(body[0])}</p>${table(lines)}<p>${esc(body[1])}</p><p style="white-space:pre-line;color:#6e6e73">${esc(sign)}</p></div>`,
      text: [greet, "", body[0], ...lines.map((l) => l.join(": ")), "", body[1], "", sign].join("\n"),
    });
  } catch (e) {
    console.error("offerte: confirmation failed", e instanceof Error ? e.message : e);
  }

  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone, msg, lang, page, services, once, month }), signal: AbortSignal.timeout(3000) });
    } catch (e) { console.error("offerte: webhook failed", e instanceof Error ? e.message : e); }
  }
  return res.status(200).json({ ok: true });
}

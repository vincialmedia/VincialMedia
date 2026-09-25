// Email content in German (Swiss spelling, "Du") and English. HTML + plain text.
import { formatDate, formatDateTime, formatDayLong, formatSlotInstants, formatVatRate } from "../format";
import { formatCHF } from "../money";
import type { Tables } from "../supabase/database.types";
import { box, button, esc, h1, layout, lines, muted, p, table, type Row } from "./layout";

export type Lang = "de" | "en";
type Order = Tables<"orders">;
type Item = Tables<"order_items">;
type Settings = Tables<"settings">;

export type Rendered = { subject: string; html: string; text: string };

export type EmailContext = {
  order: Order;
  items: Item[];
  settings: Settings;
  lang: Lang;
  orderUrl: string; // customer order page
  menuUrl: string;
};

const L = (lang: Lang, de: string, en: string) => (lang === "en" ? en : de);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const slot = (o: Order) => formatSlotInstants(o.slot_starts_at, o.slot_ends_at);
const itemName = (i: Item, lang: Lang) => (lang === "en" ? i.name_en : i.name_de);

function footer(ctx: EmailContext): string {
  const s = ctx.settings;
  return `${esc(s.business_name)} · ${esc(s.business_address)}${s.business_email ? ` · ${esc(s.business_email)}` : ""}<br>${esc(
    L(ctx.lang, "Mittagessen fürs Büro in Schlieren.", "Office lunch in Schlieren."),
  )}`;
}

function footerText(ctx: EmailContext): string {
  const s = ctx.settings;
  return `--\n${s.business_name} · ${s.business_address}${s.business_email ? ` · ${s.business_email}` : ""}`;
}

function itemRows(ctx: EmailContext): Row[] {
  return ctx.items.map((i) => ({ label: `${i.quantity} × ${esc(itemName(i, ctx.lang))}`, value: formatCHF(i.line_total_rappen) }));
}

function totalRows(ctx: EmailContext, opts: { paid?: boolean } = {}): Row[] {
  const o = ctx.order;
  const rows: Row[] = [{ label: L(ctx.lang, "Essen", "Food"), value: formatCHF(o.subtotal_rappen) }];
  if (o.discount_rappen > 0) rows.push({ label: `${L(ctx.lang, "Rabatt", "Discount")} (${esc(o.coupon_code)})`, value: `−${formatCHF(o.discount_rappen)}` });
  rows.push({ label: L(ctx.lang, "Lieferung", "Delivery"), value: o.delivery_fee_rappen ? formatCHF(o.delivery_fee_rappen) : L(ctx.lang, "Gratis", "Free") });
  if (o.tip_rappen > 0) rows.push({ label: L(ctx.lang, "Trinkgeld", "Tip"), value: formatCHF(o.tip_rappen) });
  rows.push({ label: opts.paid ? L(ctx.lang, "Total bezahlt", "Total paid") : L(ctx.lang, "Total", "Total"), value: formatCHF(o.total_rappen), strong: true });
  if (o.vat_rate_bp > 0) {
    rows.push({ label: L(ctx.lang, `inkl. ${formatVatRate(o.vat_rate_bp)} % MWST`, `incl. ${formatVatRate(o.vat_rate_bp)} % VAT`), value: formatCHF(o.vat_rappen), muted: true });
  }
  return rows;
}

function rowsText(rows: Row[]): string {
  return rows.map((r) => `${r.label.replace(/&amp;/g, "&").replace(/&[a-z]+;/g, "")}: ${r.value}`).join("\n");
}

function addressLines(o: Order): string[] {
  return [o.customer_name, o.company, o.street, `${o.postcode} ${o.city}`, o.floor_room].filter(Boolean) as string[];
}

function deliveryHtml(ctx: EmailContext): string {
  const o = ctx.order;
  return box(
    `<strong>${esc(formatDayLong(o.delivery_date, ctx.lang))}, ${esc(slot(o))}</strong><br>${addressLines(o).map(esc).join("<br>")}${
      o.delivery_note ? `<br><em>${esc(o.delivery_note)}</em>` : ""
    }`,
  );
}

function deliveryText(ctx: EmailContext): string {
  const o = ctx.order;
  return lines(`${formatDayLong(o.delivery_date, ctx.lang)}, ${slot(o)}`, ...addressLines(o), o.delivery_note);
}

// ---------------------------------------------------------------------------
// Customer emails
// ---------------------------------------------------------------------------

export function orderReceived(ctx: EmailContext): Rendered {
  const { order: o, lang } = ctx;
  const subject = L(lang, `Bestellung #${o.order_number} erhalten – noch nicht belastet`, `Order #${o.order_number} received – not charged yet`);
  const intro = L(
    lang,
    `Danke für Deine Bestellung! <strong>${formatCHF(o.total_rappen)}</strong> sind auf Deiner Karte reserviert, aber <strong>noch nicht belastet</strong>.`,
    `Thanks for your order! <strong>${formatCHF(o.total_rappen)}</strong> is reserved on your card but <strong>not charged yet</strong>.`,
  );
  const next = L(
    lang,
    "Sobald wir Deine Bestellung annehmen, belasten wir die Karte und schicken Dir den Beleg. Können wir sie nicht annehmen, geben wir die Reservierung sofort frei.",
    "Once we accept your order, we charge the card and send you the receipt. If we can't accept it, we release the hold right away.",
  );
  const html = layout({
    preheader: L(lang, "Reserviert, noch nicht belastet.", "Reserved, not charged yet."),
    body:
      h1(L(lang, `Hoi ${firstName(o.customer_name)}, Deine Bestellung ist da`, `Hi ${firstName(o.customer_name)}, we've got your order`)) +
      p(intro) +
      p(esc(next)) +
      deliveryHtml(ctx) +
      table([...itemRows(ctx), ...totalRows(ctx)]) +
      button(ctx.orderUrl, L(lang, `Bestellung #${o.order_number} ansehen`, `View order #${o.order_number}`)),
    footer: footer(ctx),
  });
  const text = lines(
    L(lang, `Hoi ${firstName(o.customer_name)}`, `Hi ${firstName(o.customer_name)}`),
    "",
    L(lang, `Danke für Deine Bestellung #${o.order_number}! ${formatCHF(o.total_rappen)} sind auf Deiner Karte reserviert, aber noch nicht belastet.`, `Thanks for order #${o.order_number}! ${formatCHF(o.total_rappen)} is reserved on your card but not charged yet.`),
    next,
    "",
    deliveryText(ctx),
    "",
    rowsText([...itemRows(ctx), ...totalRows(ctx)]),
    "",
    ctx.orderUrl,
    "",
    footerText(ctx),
  );
  return { subject, html, text };
}

export function orderAccepted(ctx: EmailContext): Rendered {
  const { order: o, lang, settings: s } = ctx;
  const subject = L(lang, `Beleg für Bestellung #${o.order_number} – bis bald!`, `Receipt for order #${o.order_number} – see you soon!`);
  const paidOn = o.accepted_at ? formatDateTime(o.accepted_at) : formatDate(o.delivery_date);
  const issuer = [s.business_name, s.business_address, s.vat_number && s.vat_rate_bp > 0 ? L(lang, `MWST-Nr. ${s.vat_number}`, `VAT no. ${s.vat_number}`) : null].filter(Boolean) as string[];
  const html = layout({
    preheader: L(lang, `Angenommen. Wir liefern ${formatDayLong(o.delivery_date, lang)}, ${slot(o)}.`, `Accepted. We deliver ${formatDayLong(o.delivery_date, lang)}, ${slot(o)}.`),
    body:
      h1(L(lang, "Angenommen, wir kochen für Dich!", "Accepted, we're cooking for you!")) +
      p(L(lang, `Deine Karte wurde mit <strong>${formatCHF(o.total_rappen)}</strong> belastet. Hier ist Dein Beleg.`, `Your card was charged <strong>${formatCHF(o.total_rappen)}</strong>. Here's your receipt.`)) +
      deliveryHtml(ctx) +
      `<h2 style="margin:18px 0 8px;font-size:16px">${esc(L(lang, `Beleg · Bestellung #${o.order_number}`, `Receipt · Order #${o.order_number}`))}</h2>` +
      table([...itemRows(ctx), ...totalRows(ctx, { paid: true })]) +
      muted(`${esc(L(lang, "Bezahlt mit Karte am", "Paid by card on"))} ${esc(paidOn)}`) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;font-size:13px;line-height:1.5"><tr>
        <td valign="top" style="padding-right:10px"><strong>${esc(L(lang, "Anbieter", "Seller"))}</strong><br>${issuer.map(esc).join("<br>")}</td>
        <td valign="top"><strong>${esc(L(lang, "Kunde", "Customer"))}</strong><br>${addressLines(o).map(esc).join("<br>")}</td>
      </tr></table>` +
      button(ctx.orderUrl, L(lang, "Beleg online ansehen", "View receipt online")),
    footer: footer(ctx),
  });
  const text = lines(
    L(lang, "Angenommen, wir kochen für Dich!", "Accepted, we're cooking for you!"),
    L(lang, `Deine Karte wurde mit ${formatCHF(o.total_rappen)} belastet.`, `Your card was charged ${formatCHF(o.total_rappen)}.`),
    "",
    deliveryText(ctx),
    "",
    L(lang, `BELEG · Bestellung #${o.order_number}`, `RECEIPT · Order #${o.order_number}`),
    rowsText([...itemRows(ctx), ...totalRows(ctx, { paid: true })]),
    `${L(lang, "Bezahlt mit Karte am", "Paid by card on")} ${paidOn}`,
    "",
    `${L(lang, "Anbieter", "Seller")}:`,
    ...issuer,
    "",
    `${L(lang, "Kunde", "Customer")}:`,
    ...addressLines(o),
    "",
    ctx.orderUrl,
    "",
    footerText(ctx),
  );
  return { subject, html, text };
}

export function orderRejected(ctx: EmailContext): Rendered {
  const { order: o, lang } = ctx;
  const subject = L(lang, `Bestellung #${o.order_number}: leider abgelehnt – nicht belastet`, `Order #${o.order_number}: sorry, declined – not charged`);
  const released = L(
    lang,
    "Du zahlst nichts. Wir haben die Reservierung auf Deiner Karte freigegeben. Je nach Bank dauert es ein paar Tage, bis sie aus der Übersicht verschwindet.",
    "You pay nothing. We released the hold on your card. Depending on your bank it can take a few days to disappear from your statement.",
  );
  const html = layout({
    preheader: L(lang, "Nicht belastet.", "Not charged."),
    body:
      h1(L(lang, "Das klappt diesmal leider nicht", "Sorry, we can't make this one")) +
      p(esc(L(lang, `Wir können Deine Bestellung #${o.order_number} für ${formatDayLong(o.delivery_date, lang)} leider nicht annehmen.`, `We can't accept your order #${o.order_number} for ${formatDayLong(o.delivery_date, lang)}.`))) +
      (o.reject_reason ? box(`<strong>${esc(L(lang, "Grund", "Reason"))}:</strong> ${esc(o.reject_reason)}`) : "") +
      p(esc(released)) +
      button(ctx.menuUrl, L(lang, "Zum Menü", "See the menu")),
    footer: footer(ctx),
  });
  const text = lines(
    L(lang, `Wir können Deine Bestellung #${o.order_number} für ${formatDayLong(o.delivery_date, lang)} leider nicht annehmen.`, `We can't accept your order #${o.order_number} for ${formatDayLong(o.delivery_date, lang)}.`),
    o.reject_reason && `${L(lang, "Grund", "Reason")}: ${o.reject_reason}`,
    "",
    released,
    "",
    ctx.menuUrl,
    "",
    footerText(ctx),
  );
  return { subject, html, text };
}

export function orderAutoCancelled(ctx: EmailContext): Rendered {
  const { order: o, lang } = ctx;
  const subject = L(lang, `Bestellung #${o.order_number} storniert – nicht belastet`, `Order #${o.order_number} cancelled – not charged`);
  const body = L(
    lang,
    `Wir konnten Deine Bestellung #${o.order_number} für ${formatDayLong(o.delivery_date, lang)} nicht rechtzeitig bestätigen und haben sie deshalb storniert. Tut uns leid!`,
    `We couldn't confirm your order #${o.order_number} for ${formatDayLong(o.delivery_date, lang)} in time, so we cancelled it. Sorry about that!`,
  );
  const released = L(lang, "Du zahlst nichts: Die Reservierung auf Deiner Karte ist freigegeben.", "You pay nothing: the hold on your card has been released.");
  const html = layout({
    preheader: L(lang, "Nicht belastet.", "Not charged."),
    body: h1(L(lang, "Bestellung storniert", "Order cancelled")) + p(esc(body)) + p(esc(released)) + button(ctx.menuUrl, L(lang, "Nochmals bestellen", "Order again")),
    footer: footer(ctx),
  });
  return { subject, html, text: lines(body, "", released, "", ctx.menuUrl, "", footerText(ctx)) };
}

export function orderRefunded(ctx: EmailContext, amountRappen: number): Rendered {
  const { order: o, lang } = ctx;
  const full = o.amount_refunded_rappen >= o.amount_captured_rappen;
  const subject = L(lang, `Rückerstattung für Bestellung #${o.order_number}`, `Refund for order #${o.order_number}`);
  const body = L(
    lang,
    `Wir haben Dir <strong>${formatCHF(amountRappen)}</strong> für Bestellung #${o.order_number} zurückerstattet${full ? " (voller Betrag)" : ""}. Die Gutschrift erscheint je nach Bank in 5 bis 10 Tagen auf Deiner Karte.`,
    `We refunded <strong>${formatCHF(amountRappen)}</strong> for order #${o.order_number}${full ? " (full amount)" : ""}. Depending on your bank, it shows up on your card within 5 to 10 days.`,
  );
  const html = layout({
    preheader: L(lang, `${formatCHF(amountRappen)} zurückerstattet.`, `${formatCHF(amountRappen)} refunded.`),
    body:
      h1(L(lang, "Rückerstattung unterwegs", "Refund on its way")) +
      p(body) +
      table([
        { label: L(lang, "Bezahlt", "Paid"), value: formatCHF(o.amount_captured_rappen) },
        { label: L(lang, "Total zurückerstattet", "Total refunded"), value: formatCHF(o.amount_refunded_rappen), strong: true },
      ]) +
      button(ctx.orderUrl, L(lang, "Bestellung ansehen", "View order")),
    footer: footer(ctx),
  });
  return { subject, html, text: lines(body.replace(/<[^>]+>/g, ""), "", ctx.orderUrl, "", footerText(ctx)) };
}

// ---------------------------------------------------------------------------
// Admin emails
// ---------------------------------------------------------------------------

export function adminNewOrder(ctx: EmailContext & { adminUrl: string; decideBy: Date }): Rendered {
  const { order: o, lang } = ctx;
  const subject = `${L(lang, "Neue Bestellung", "New order")} #${o.order_number} · ${formatDayLong(o.delivery_date, lang)} ${slot(o)} · ${formatCHF(o.total_rappen)}`;
  const decide = L(lang, `Bitte entscheiden bis ${formatDateTime(ctx.decideBy)}, sonst wird sie automatisch storniert.`, `Please decide by ${formatDateTime(ctx.decideBy)}, otherwise it is cancelled automatically.`);
  const contact = [o.customer_email, o.phone].filter(Boolean) as string[];
  const html = layout({
    preheader: `${o.customer_name}${o.company ? `, ${o.company}` : ""}: ${formatCHF(o.total_rappen)}`,
    body:
      h1(`${L(lang, "Neue Bestellung", "New order")} #${o.order_number}`) +
      button(ctx.adminUrl, L(lang, "Annehmen oder ablehnen", "Accept or reject")) +
      p(esc(decide)) +
      deliveryHtml(ctx) +
      p(contact.map(esc).join(" · ")) +
      table([...itemRows(ctx), ...totalRows(ctx)]),
    footer: "wunch admin",
  });
  const text = lines(
    `${L(lang, "Neue Bestellung", "New order")} #${o.order_number}`,
    ctx.adminUrl,
    decide,
    "",
    deliveryText(ctx),
    contact.join(" · "),
    "",
    rowsText([...itemRows(ctx), ...totalRows(ctx)]),
  );
  return { subject, html, text };
}

export function adminReminder(
  lang: Lang,
  orders: { order: Order; url: string }[],
  settings: Settings,
): Rendered {
  const n = orders.length;
  const subject = L(lang, `${n} ${n === 1 ? "Bestellung wartet" : "Bestellungen warten"} auf Dich`, `${n} ${n === 1 ? "order is" : "orders are"} waiting for you`);
  const list = orders
    .map(({ order: o, url }) => `<li style="margin:0 0 8px"><a href="${esc(url)}" style="color:#c73e1d;font-weight:bold">#${o.order_number}</a> · ${esc(o.customer_name)}${o.company ? `, ${esc(o.company)}` : ""} · ${esc(formatDayLong(o.delivery_date, lang))} ${esc(slot(o))} · ${formatCHF(o.total_rappen)}</li>`)
    .join("");
  const html = layout({
    preheader: subject,
    body:
      h1(subject) +
      p(esc(L(lang, "Diese Bestellungen sind noch nicht angenommen oder abgelehnt:", "These orders are not accepted or rejected yet:"))) +
      `<ul style="padding-left:18px;margin:0 0 16px">${list}</ul>` +
      (orders[0] ? button(orders[0].url.replace(/\/orders\/.*$/, ""), L(lang, "Zur Admin-Übersicht", "Open admin")) : ""),
    footer: `${esc(settings.business_name)} admin`,
  });
  const text = lines(
    subject,
    "",
    ...orders.map(({ order: o, url }) => `#${o.order_number} · ${o.customer_name}${o.company ? `, ${o.company}` : ""} · ${formatDayLong(o.delivery_date, lang)} ${slot(o)} · ${formatCHF(o.total_rappen)}\n${url}`),
  );
  return { subject, html, text };
}

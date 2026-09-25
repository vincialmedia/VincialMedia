// Payment report: pure functions (grouping, totals, CSV), unit tested.
import { formatDate } from "./format";
import { rappenToInput } from "./money";
import { zurichNow } from "./schedule";

export type PaymentRow = {
  orderId: string;
  orderNumber: number;
  paidAt: string; // ISO instant of capture
  date: string; // Zurich calendar date of capture
  customer: string;
  company: string | null;
  paid: number;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  tip: number;
  deliveryFee: number;
  refunded: number;
  fee: number | null;
  net: number | null; // payout after Stripe fee and refunds
  paymentIntentId: string | null;
};

export type Totals = { count: number; paid: number; subtotal: number; discount: number; tip: number; deliveryFee: number; refunded: number; fee: number; net: number };
export type Group = { key: string; label: string; totals: Totals };
export type GroupBy = "day" | "week" | "month";

type OrderLike = {
  id: string;
  order_number: number;
  accepted_at: string | null;
  customer_name: string;
  company: string | null;
  amount_captured_rappen: number;
  subtotal_rappen: number;
  discount_rappen: number;
  coupon_code: string | null;
  tip_rappen: number;
  delivery_fee_rappen: number;
  amount_refunded_rappen: number;
  stripe_fee_rappen: number | null;
  stripe_net_rappen: number | null;
  stripe_payment_intent_id: string | null;
};

export function toPaymentRow(o: OrderLike): PaymentRow {
  const paidAt = o.accepted_at ?? new Date(0).toISOString();
  return {
    orderId: o.id,
    orderNumber: o.order_number,
    paidAt,
    date: zurichNow(new Date(paidAt)).date,
    customer: o.customer_name,
    company: o.company,
    paid: o.amount_captured_rappen,
    subtotal: o.subtotal_rappen,
    discount: o.discount_rappen,
    couponCode: o.coupon_code,
    tip: o.tip_rappen,
    deliveryFee: o.delivery_fee_rappen,
    refunded: o.amount_refunded_rappen,
    fee: o.stripe_fee_rappen,
    net: o.stripe_net_rappen === null ? null : o.stripe_net_rappen - o.amount_refunded_rappen,
    paymentIntentId: o.stripe_payment_intent_id,
  };
}

/** ISO 8601 week number and year of a calendar date. */
export function isoWeek(date: string): { year: number; week: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function emptyTotals(): Totals {
  return { count: 0, paid: 0, subtotal: 0, discount: 0, tip: 0, deliveryFee: 0, refunded: 0, fee: 0, net: 0 };
}

export function addToTotals(t: Totals, r: PaymentRow): Totals {
  return {
    count: t.count + 1,
    paid: t.paid + r.paid,
    subtotal: t.subtotal + r.subtotal,
    discount: t.discount + r.discount,
    tip: t.tip + r.tip,
    deliveryFee: t.deliveryFee + r.deliveryFee,
    refunded: t.refunded + r.refunded,
    fee: t.fee + (r.fee ?? 0),
    net: t.net + (r.net ?? r.paid - r.refunded),
  };
}

export function groupPayments(rows: PaymentRow[], by: GroupBy): Group[] {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    let key: string;
    let label: string;
    if (by === "day") {
      key = r.date;
      label = formatDate(r.date);
    } else if (by === "month") {
      key = r.date.slice(0, 7);
      label = `${r.date.slice(5, 7)}.${r.date.slice(0, 4)}`;
    } else {
      const { year, week } = isoWeek(r.date);
      key = `${year}-W${String(week).padStart(2, "0")}`;
      label = key;
    }
    const g = groups.get(key) ?? { key, label, totals: emptyTotals() };
    g.totals = addToTotals(g.totals, r);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV for Excel in Switzerland: semicolon separated, UTF-8 with BOM,
 * amounts in CHF with a dot ("14.50").
 */
export function paymentsCsv(rows: PaymentRow[]): string {
  const header = ["Datum", "Bestellung", "Kunde", "Firma", "Bezahlt CHF", "Essen CHF", "Rabatt CHF", "Gutschein", "Trinkgeld CHF", "Lieferung CHF", "Rueckerstattet CHF", "Stripe-Gebuehr CHF", "Netto CHF", "Stripe PaymentIntent"];
  const money = (r: number | null) => (r === null ? "" : rappenToInput(r));
  const lines = rows.map((r) =>
    [formatDate(r.date), r.orderNumber, r.customer, r.company, money(r.paid), money(r.subtotal), money(r.discount), r.couponCode, money(r.tip), money(r.deliveryFee), money(r.refunded), money(r.fee), money(r.net), r.paymentIntentId]
      .map(csvCell)
      .join(";"),
  );
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}

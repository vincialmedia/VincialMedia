import { describe, expect, it } from "vitest";
import { groupPayments, isoWeek, paymentsCsv, toPaymentRow } from "./reports";

const order = (n: number, acceptedAt: string, extra: Partial<Parameters<typeof toPaymentRow>[0]> = {}) =>
  toPaymentRow({
    id: `o${n}`,
    order_number: n,
    accepted_at: acceptedAt,
    customer_name: "Anna; \"Muster\"",
    company: "Muster AG",
    amount_captured_rappen: 2000,
    subtotal_rappen: 2000,
    discount_rappen: 0,
    coupon_code: null,
    tip_rappen: 0,
    delivery_fee_rappen: 0,
    amount_refunded_rappen: 0,
    stripe_fee_rappen: 88,
    stripe_net_rappen: 1912,
    stripe_payment_intent_id: `pi_${n}`,
    ...extra,
  });

describe("reports", () => {
  it("uses the Zurich date of capture", () => {
    expect(order(1, "2026-09-28T22:30:00Z").date).toBe("2026-09-29");
  });
  it("computes net after refunds", () => {
    expect(order(1, "2026-09-28T10:00:00Z", { amount_refunded_rappen: 500 }).net).toBe(1412);
  });
  it("computes ISO weeks", () => {
    expect(isoWeek("2026-09-28")).toEqual({ year: 2026, week: 40 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
  });
  it("groups per day, week and month", () => {
    const rows = [order(1, "2026-09-28T10:00:00Z"), order(2, "2026-09-28T11:00:00Z"), order(3, "2026-10-01T10:00:00Z")];
    expect(groupPayments(rows, "day").map((g) => [g.label, g.totals.count, g.totals.paid])).toEqual([
      ["28.09.2026", 2, 4000],
      ["01.10.2026", 1, 2000],
    ]);
    expect(groupPayments(rows, "week").map((g) => [g.key, g.totals.count])).toEqual([["2026-W40", 3]]);
    expect(groupPayments(rows, "month").map((g) => [g.label, g.totals.net])).toEqual([
      ["09.2026", 3824],
      ["10.2026", 1912],
    ]);
  });
  it("neutralises spreadsheet formulas typed by customers", () => {
    const csv = paymentsCsv([order(8, "2026-09-28T10:00:00Z", { customer_name: '=HYPERLINK("https://evil","Rechnung")', company: "+41 Treuhand" })]);
    expect(csv).toContain(`"'=HYPERLINK(""https://evil"",""Rechnung"")"`);
    expect(csv).toContain(";'+41 Treuhand;");
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });
  it("writes Excel-friendly CSV", () => {
    const csv = paymentsCsv([order(7, "2026-09-28T10:00:00Z")]);
    expect(csv.startsWith("﻿Datum;Bestellung")).toBe(true);
    expect(csv).toContain('28.09.2026;7;"Anna; ""Muster""";Muster AG;20.00;20.00;0.00;;0.00;0.00;0.00;0.88;19.12;pi_7');
  });
});

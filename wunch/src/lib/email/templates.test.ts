import { describe, expect, it } from "vitest";
import type { Tables } from "../supabase/database.types";
import * as T from "./templates";

const order = {
  id: "o1",
  order_number: 1042,
  user_id: "u1",
  status: "new",
  locale: "de",
  delivery_date: "2026-09-28",
  slot_id: "s1",
  slot_starts_at: "2026-09-28T09:45:00Z",
  slot_ends_at: "2026-09-28T10:15:00Z",
  customer_name: "Anna <script>alert(1)</script> Muster",
  customer_email: "anna@example.com",
  company: "Muster AG",
  street: "Zürcherstrasse 42",
  postcode: "8952",
  city: "Schlieren",
  floor_room: "3. Stock",
  phone: "079 123 45 67",
  delivery_note: "Beim Empfang",
  subtotal_rappen: 3300,
  discount_rappen: 330,
  delivery_fee_rappen: 0,
  tip_rappen: 300,
  total_rappen: 3270,
  tip_percent: 10,
  vat_rate_bp: 0,
  vat_rappen: 0,
  coupon_id: null,
  coupon_code: "WILLKOMMEN10",
  stripe_payment_intent_id: "pi_1",
  stripe_charge_id: "ch_1",
  capture_before: "2026-10-02T10:00:00Z",
  amount_captured_rappen: 3270,
  amount_refunded_rappen: 500,
  stripe_fee_rappen: 125,
  stripe_net_rappen: 3145,
  reject_reason: "Leider ausverkauft",
  authorized_at: "2026-09-25T08:00:00Z",
  accepted_at: "2026-09-25T08:10:00Z",
  delivered_at: null,
  cancelled_at: null,
  admin_reminded_at: null,
  reservations_released_at: null,
  action_lock_until: null,
  created_at: "2026-09-25T07:59:00Z",
  updated_at: "2026-09-25T08:10:00Z",
} as Tables<"orders">;

const items = [
  { id: "i1", order_id: "o1", meal_id: "m1", name_de: "Älplermagronen", name_en: "Alpine macaroni", unit_price_rappen: 1650, quantity: 2, line_total_rappen: 3300 },
] as Tables<"order_items">[];

const settings = { business_name: "wunch", business_address: "8952 Schlieren", business_email: "hallo@wunch.ch", vat_rate_bp: 0, vat_number: null } as Tables<"settings">;

const ctx = (lang: T.Lang, o: Partial<Tables<"orders">> = {}, s: Partial<Tables<"settings">> = {}): T.EmailContext => ({
  order: { ...order, ...o },
  items,
  settings: { ...settings, ...s },
  lang,
  orderUrl: "https://wunch.ch/orders/o1",
  menuUrl: "https://wunch.ch/",
});

const all = (lang: T.Lang) => [
  T.orderReceived(ctx(lang)),
  T.orderAccepted(ctx(lang)),
  T.orderRejected(ctx(lang)),
  T.orderAutoCancelled(ctx(lang)),
  T.orderRefunded(ctx(lang), 500),
  T.adminNewOrder({ ...ctx(lang), adminUrl: "https://wunch.ch/admin/orders/o1", decideBy: new Date("2026-09-28T09:45:00Z") }),
  T.adminReminder(lang, [{ order, url: "https://wunch.ch/admin/orders/o1" }], settings),
];

describe("email templates", () => {
  it("render every email in German and English with HTML and text", () => {
    for (const lang of ["de", "en"] as const) {
      for (const email of all(lang)) {
        expect(email.subject.length).toBeGreaterThan(5);
        expect(email.html).toContain("<!doctype html>");
        expect(email.html).toContain("work + lunch");
        expect(email.text.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("escape customer input in HTML", () => {
    for (const email of all("de")) {
      expect(email.html).not.toContain("<script>");
    }
  });

  it("say clearly that the card is only reserved or not charged", () => {
    expect(T.orderReceived(ctx("de")).subject).toContain("noch nicht belastet");
    expect(T.orderReceived(ctx("en")).subject).toContain("not charged yet");
    expect(T.orderRejected(ctx("de")).text).toContain("Du zahlst nichts");
    expect(T.orderRejected(ctx("de")).text).toContain("Leider ausverkauft");
    expect(T.orderAutoCancelled(ctx("en")).subject).toContain("not charged");
  });

  it("put company, address and amounts on the receipt", () => {
    const r = T.orderAccepted(ctx("de"));
    expect(r.text).toContain("Muster AG");
    expect(r.text).toContain("Zürcherstrasse 42");
    expect(r.text).toContain("Rabatt (WILLKOMMEN10): −CHF 3.30");
    expect(r.text).toContain("Total bezahlt: CHF 32.70");
    expect(r.text).not.toContain("MWST");
  });

  it("show VAT only when a rate is set", () => {
    const r = T.orderAccepted(ctx("de", { vat_rate_bp: 260, vat_rappen: 77 }, { vat_rate_bp: 260, vat_number: "CHE-123.456.789 MWST" }));
    expect(r.text).toContain("inkl. 2.6 % MWST: CHF 0.77");
    expect(r.text).toContain("MWST-Nr. CHE-123.456.789 MWST");
  });

  it("link the admin straight to the order", () => {
    const r = T.adminNewOrder({ ...ctx("de"), adminUrl: "https://wunch.ch/admin/orders/o1", decideBy: new Date("2026-09-28T09:45:00Z") });
    expect(r.html).toContain('href="https://wunch.ch/admin/orders/o1"');
    expect(r.text).toContain("28.09.2026, 11:45");
  });

  it("use Swiss spelling in German", () => {
    for (const email of all("de")) expect(email.html + email.text + email.subject).not.toContain("ß");
  });
});

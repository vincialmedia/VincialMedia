import { describe, expect, it } from "vitest";
import { type Coupon, couponToDiscount, isValidCouponCodeFormat, normalizeCouponCode, validateCoupon } from "./coupons";

const base: Coupon = {
  id: "c1",
  code: "LUNCH5",
  kind: "fixed",
  percent_off: null,
  amount_off_rappen: 500,
  is_active: true,
  valid_from: null,
  valid_to: null,
  max_total_uses: null,
  max_uses_per_customer: null,
  min_order_rappen: 0,
  first_order_only: false,
  archived_at: null,
};
const usage = { totalUses: 0, customerUses: 0, customerHasOrders: false };
const ctx = { today: "2026-09-28", subtotalRappen: 3300, usage };

describe("normalizeCouponCode", () => {
  it("is case-insensitive and trims", () => {
    expect(normalizeCouponCode("  willkommen10 ")).toBe("WILLKOMMEN10");
    expect(isValidCouponCodeFormat("WILLKOMMEN10")).toBe(true);
    expect(isValidCouponCodeFormat("NO SPACES")).toBe(false);
    expect(isValidCouponCodeFormat("AB")).toBe(false);
  });
});

describe("validateCoupon", () => {
  it("accepts a plain active coupon", () => {
    expect(validateCoupon(base, ctx)).toEqual({ ok: true });
  });
  it("rejects missing, archived and inactive coupons", () => {
    expect(validateCoupon(null, ctx)).toEqual({ ok: false, error: "not_found" });
    expect(validateCoupon({ ...base, archived_at: "2026-01-01" }, ctx)).toEqual({ ok: false, error: "not_found" });
    expect(validateCoupon({ ...base, is_active: false }, ctx)).toEqual({ ok: false, error: "inactive" });
  });
  it("respects the validity window (inclusive)", () => {
    expect(validateCoupon({ ...base, valid_from: "2026-09-29" }, ctx)).toEqual({ ok: false, error: "not_yet_valid" });
    expect(validateCoupon({ ...base, valid_to: "2026-09-27" }, ctx)).toEqual({ ok: false, error: "expired" });
    expect(validateCoupon({ ...base, valid_from: "2026-09-28", valid_to: "2026-09-28" }, ctx)).toEqual({ ok: true });
  });
  it("checks the minimum order amount against the meal subtotal", () => {
    expect(validateCoupon({ ...base, min_order_rappen: 4000 }, ctx)).toEqual({ ok: false, error: "min_order" });
    expect(validateCoupon({ ...base, min_order_rappen: 3300 }, ctx)).toEqual({ ok: true });
  });
  it("checks total and per-customer limits", () => {
    expect(validateCoupon({ ...base, max_total_uses: 3 }, { ...ctx, usage: { ...usage, totalUses: 3 } })).toEqual({ ok: false, error: "exhausted" });
    expect(validateCoupon({ ...base, max_total_uses: 3 }, { ...ctx, usage: { ...usage, totalUses: 2 } })).toEqual({ ok: true });
    expect(validateCoupon({ ...base, max_uses_per_customer: 1 }, { ...ctx, usage: { ...usage, customerUses: 1 } })).toEqual({ ok: false, error: "customer_limit" });
  });
  it("enforces first order only", () => {
    expect(validateCoupon({ ...base, first_order_only: true }, { ...ctx, usage: { ...usage, customerHasOrders: true } })).toEqual({ ok: false, error: "first_order_only" });
    expect(validateCoupon({ ...base, first_order_only: true }, ctx)).toEqual({ ok: true });
  });
});

describe("couponToDiscount", () => {
  it("maps both kinds", () => {
    expect(couponToDiscount(base)).toEqual({ kind: "fixed", amountOffRappen: 500 });
    expect(couponToDiscount({ ...base, kind: "percent", percent_off: 10, amount_off_rappen: null })).toEqual({ kind: "percent", percentOff: 10 });
  });
});

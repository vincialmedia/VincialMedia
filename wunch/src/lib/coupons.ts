// Coupon rules. Limits that depend on concurrent orders are re-checked in
// the create_order database function under a row lock.
import type { CouponDiscount } from "./pricing";

export type Coupon = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  percent_off: number | null;
  amount_off_rappen: number | null;
  is_active: boolean;
  valid_from: string | null; // YYYY-MM-DD, inclusive
  valid_to: string | null; // YYYY-MM-DD, inclusive
  max_total_uses: number | null;
  max_uses_per_customer: number | null;
  min_order_rappen: number;
  first_order_only: boolean;
  archived_at: string | null;
};

export type CouponError =
  | "not_found"
  | "inactive"
  | "not_yet_valid"
  | "expired"
  | "min_order"
  | "exhausted"
  | "customer_limit"
  | "first_order_only";

export type CouponUsage = {
  totalUses: number; // redemptions not released
  customerUses: number; // this customer's redemptions not released
  customerHasOrders: boolean; // any live order before this one
};

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidCouponCodeFormat(code: string): boolean {
  return /^[A-Z0-9_-]{3,32}$/.test(code);
}

export function couponToDiscount(coupon: Coupon): CouponDiscount {
  return coupon.kind === "percent"
    ? { kind: "percent", percentOff: coupon.percent_off ?? 0 }
    : { kind: "fixed", amountOffRappen: coupon.amount_off_rappen ?? 0 };
}

export function validateCoupon(
  coupon: Coupon | null,
  ctx: { today: string; subtotalRappen: number; usage: CouponUsage },
): { ok: true } | { ok: false; error: CouponError } {
  if (!coupon || coupon.archived_at) return { ok: false, error: "not_found" };
  if (!coupon.is_active) return { ok: false, error: "inactive" };
  if (coupon.valid_from && ctx.today < coupon.valid_from) return { ok: false, error: "not_yet_valid" };
  if (coupon.valid_to && ctx.today > coupon.valid_to) return { ok: false, error: "expired" };
  if (ctx.subtotalRappen < coupon.min_order_rappen) return { ok: false, error: "min_order" };
  if (coupon.max_total_uses !== null && ctx.usage.totalUses >= coupon.max_total_uses) {
    return { ok: false, error: "exhausted" };
  }
  if (coupon.max_uses_per_customer !== null && ctx.usage.customerUses >= coupon.max_uses_per_customer) {
    return { ok: false, error: "customer_limit" };
  }
  if (coupon.first_order_only && ctx.usage.customerHasOrders) return { ok: false, error: "first_order_only" };
  return { ok: true };
}

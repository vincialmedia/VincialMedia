// Server-side price calculation. The browser never decides an amount.
import { roundTo5 } from "./money";

export const MAX_CUSTOM_TIP_RAPPEN = 10_000; // CHF 100, protects against typos
export const STRIPE_MIN_CHARGE_RAPPEN = 50; // Stripe minimum for CHF

export type TipChoice =
  | { kind: "none" }
  | { kind: "percent"; percent: number }
  | { kind: "custom"; rappen: number };

export type CouponDiscount =
  | { kind: "percent"; percentOff: number }
  | { kind: "fixed"; amountOffRappen: number };

export type PricedLine = { unitPriceRappen: number; quantity: number };

export type PriceBreakdown = {
  subtotalRappen: number;
  discountRappen: number;
  mealsAfterDiscountRappen: number;
  deliveryFeeRappen: number;
  tipRappen: number;
  tipPercent: number | null;
  totalRappen: number;
  vatRateBp: number;
  vatRappen: number;
};

export class PricingError extends Error {
  constructor(public code: "invalid_tip" | "invalid_line") {
    super(code);
  }
}

export function computeSubtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isInteger(line.unitPriceRappen) || line.unitPriceRappen < 0) {
      throw new PricingError("invalid_line");
    }
    return sum + line.unitPriceRappen * line.quantity;
  }, 0);
}

/**
 * Coupons only reduce the meal subtotal (never tip or delivery fee) and never
 * push it below zero. Percentage discounts are rounded to 5 Rappen.
 */
export function computeDiscount(subtotalRappen: number, coupon: CouponDiscount | null): number {
  if (!coupon || subtotalRappen <= 0) return 0;
  const raw =
    coupon.kind === "percent"
      ? roundTo5((subtotalRappen * coupon.percentOff) / 100)
      : coupon.amountOffRappen;
  return Math.max(0, Math.min(raw, subtotalRappen));
}

/**
 * Tips: percentages are calculated on the meal subtotal after discount and
 * rounded to 5 Rappen. Custom tips are rounded to 5 Rappen and capped.
 */
export function computeTip(
  mealsAfterDiscountRappen: number,
  tip: TipChoice,
  allowedPercents: number[],
): { tipRappen: number; tipPercent: number | null } {
  switch (tip.kind) {
    case "none":
      return { tipRappen: 0, tipPercent: null };
    case "percent":
      if (!allowedPercents.includes(tip.percent)) throw new PricingError("invalid_tip");
      return { tipRappen: roundTo5((mealsAfterDiscountRappen * tip.percent) / 100), tipPercent: tip.percent };
    case "custom": {
      if (!Number.isInteger(tip.rappen) || tip.rappen < 0 || tip.rappen > MAX_CUSTOM_TIP_RAPPEN) {
        throw new PricingError("invalid_tip");
      }
      return { tipRappen: roundTo5(tip.rappen), tipPercent: null };
    }
  }
}

/** VAT contained in a gross amount. rateBp: 810 = 8.1 %. */
export function computeIncludedVat(grossRappen: number, rateBp: number): number {
  if (rateBp <= 0 || grossRappen <= 0) return 0;
  return Math.round((grossRappen * rateBp) / (10_000 + rateBp));
}

export function priceOrder(input: {
  lines: PricedLine[];
  coupon: CouponDiscount | null;
  tip: TipChoice;
  allowedTipPercents: number[];
  deliveryFeeRappen: number;
  vatRateBp: number;
}): PriceBreakdown {
  const subtotalRappen = computeSubtotal(input.lines);
  const discountRappen = computeDiscount(subtotalRappen, input.coupon);
  const mealsAfterDiscountRappen = subtotalRappen - discountRappen;
  const { tipRappen, tipPercent } = computeTip(mealsAfterDiscountRappen, input.tip, input.allowedTipPercents);
  const deliveryFeeRappen = input.deliveryFeeRappen;
  const totalRappen = mealsAfterDiscountRappen + deliveryFeeRappen + tipRappen;
  // VAT applies to meals and delivery; a voluntary tip is not a supply (ask your accountant).
  const vatRappen = computeIncludedVat(mealsAfterDiscountRappen + deliveryFeeRappen, input.vatRateBp);
  return {
    subtotalRappen,
    discountRappen,
    mealsAfterDiscountRappen,
    deliveryFeeRappen,
    tipRappen,
    tipPercent,
    totalRappen,
    vatRateBp: input.vatRateBp,
    vatRappen,
  };
}

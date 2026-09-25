import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_TIP_RAPPEN,
  PricingError,
  computeDiscount,
  computeIncludedVat,
  computeTip,
  priceOrder,
} from "./pricing";

const TIPS = [5, 10, 15];

describe("computeDiscount", () => {
  it("applies a percentage rounded to 5 Rappen", () => {
    expect(computeDiscount(3300, { kind: "percent", percentOff: 10 })).toBe(330);
    // 1234 * 10% = 123.4 -> 125
    expect(computeDiscount(1234, { kind: "percent", percentOff: 10 })).toBe(125);
    // 1950 * 15% = 292.5 -> 295 (half up)
    expect(computeDiscount(1950, { kind: "percent", percentOff: 15 })).toBe(295);
  });
  it("applies a fixed amount", () => {
    expect(computeDiscount(3300, { kind: "fixed", amountOffRappen: 500 })).toBe(500);
  });
  it("never pushes the subtotal below zero", () => {
    expect(computeDiscount(400, { kind: "fixed", amountOffRappen: 500 })).toBe(400);
    expect(computeDiscount(1650, { kind: "percent", percentOff: 100 })).toBe(1650);
    expect(computeDiscount(0, { kind: "fixed", amountOffRappen: 500 })).toBe(0);
  });
  it("returns zero without a coupon", () => {
    expect(computeDiscount(3300, null)).toBe(0);
  });
});

describe("computeTip", () => {
  it("calculates percentages on the discounted meal subtotal, rounded to 5 Rappen", () => {
    expect(computeTip(2970, { kind: "percent", percent: 10 }, TIPS)).toEqual({ tipRappen: 295, tipPercent: 10 });
    expect(computeTip(1650, { kind: "percent", percent: 5 }, TIPS)).toEqual({ tipRappen: 85, tipPercent: 5 });
    expect(computeTip(1650, { kind: "percent", percent: 15 }, TIPS)).toEqual({ tipRappen: 250, tipPercent: 15 });
  });
  it("supports no tip", () => {
    expect(computeTip(1650, { kind: "none" }, TIPS)).toEqual({ tipRappen: 0, tipPercent: null });
  });
  it("rounds custom tips to 5 Rappen", () => {
    expect(computeTip(1650, { kind: "custom", rappen: 212 }, TIPS)).toEqual({ tipRappen: 210, tipPercent: null });
    expect(computeTip(1650, { kind: "custom", rappen: 0 }, TIPS)).toEqual({ tipRappen: 0, tipPercent: null });
  });
  it("rejects percentages that are not offered", () => {
    expect(() => computeTip(1650, { kind: "percent", percent: 50 }, TIPS)).toThrow(PricingError);
  });
  it("rejects negative, fractional and huge custom tips", () => {
    expect(() => computeTip(1650, { kind: "custom", rappen: -5 }, TIPS)).toThrow(PricingError);
    expect(() => computeTip(1650, { kind: "custom", rappen: 1.5 }, TIPS)).toThrow(PricingError);
    expect(() => computeTip(1650, { kind: "custom", rappen: MAX_CUSTOM_TIP_RAPPEN + 5 }, TIPS)).toThrow(PricingError);
  });
});

describe("computeIncludedVat", () => {
  it("extracts VAT from a gross amount", () => {
    expect(computeIncludedVat(10810, 810)).toBe(810);
    expect(computeIncludedVat(1650, 260)).toBe(42); // 1650 * 2.6 / 102.6 = 41.8
    expect(computeIncludedVat(1650, 0)).toBe(0);
  });
});

describe("priceOrder", () => {
  it("builds the full breakdown", () => {
    const result = priceOrder({
      lines: [
        { unitPriceRappen: 1650, quantity: 2 },
        { unitPriceRappen: 650, quantity: 1 },
      ],
      coupon: { kind: "percent", percentOff: 10 },
      tip: { kind: "percent", percent: 10 },
      allowedTipPercents: TIPS,
      deliveryFeeRappen: 300,
      vatRateBp: 0,
    });
    expect(result).toEqual({
      subtotalRappen: 3950,
      discountRappen: 395,
      mealsAfterDiscountRappen: 3555,
      deliveryFeeRappen: 300,
      tipRappen: 355, // 355.5 -> 355
      tipPercent: 10,
      totalRappen: 3555 + 300 + 355,
      vatRateBp: 0,
      vatRappen: 0,
    });
  });

  it("never discounts the tip or the delivery fee", () => {
    const result = priceOrder({
      lines: [{ unitPriceRappen: 400, quantity: 1 }],
      coupon: { kind: "fixed", amountOffRappen: 500 },
      tip: { kind: "custom", rappen: 200 },
      allowedTipPercents: TIPS,
      deliveryFeeRappen: 300,
      vatRateBp: 0,
    });
    expect(result.discountRappen).toBe(400);
    expect(result.mealsAfterDiscountRappen).toBe(0);
    expect(result.totalRappen).toBe(500);
  });

  it("computes included VAT on meals and delivery, not on the tip", () => {
    const result = priceOrder({
      lines: [{ unitPriceRappen: 10810, quantity: 1 }],
      coupon: null,
      tip: { kind: "custom", rappen: 1000 },
      allowedTipPercents: TIPS,
      deliveryFeeRappen: 0,
      vatRateBp: 810,
    });
    expect(result.vatRappen).toBe(810);
    expect(result.totalRappen).toBe(11810);
  });

  it("rejects invalid lines", () => {
    expect(() =>
      priceOrder({
        lines: [{ unitPriceRappen: 1650, quantity: 0 }],
        coupon: null,
        tip: { kind: "none" },
        allowedTipPercents: TIPS,
        deliveryFeeRappen: 0,
        vatRateBp: 0,
      }),
    ).toThrow(PricingError);
  });
});

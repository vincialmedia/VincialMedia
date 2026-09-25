import "server-only";
import { z } from "zod";
import { type Coupon, type CouponError, couponToDiscount, normalizeCouponCode, validateCoupon } from "../coupons";
import { getMenuForDate } from "../data/menu";
import { getClosedDates, getSettings, getSlots, toCalendarSettings } from "../data/settings";
import { formatCHF } from "../money";
import { MAX_CUSTOM_TIP_RAPPEN, type PriceBreakdown, PricingError, STRIPE_MIN_CHARGE_RAPPEN, priceOrder } from "../pricing";
import { type SlotAvailability, getOrderableDates, getSlotAvailability, zurichNow } from "../schedule";
import { createAdminClient } from "../supabase/admin";
import { UUID_RE } from "../validation";

export const tipSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("percent"), percent: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal("custom"), rappen: z.number().int().min(0).max(MAX_CUSTOM_TIP_RAPPEN) }),
]);

export const quoteInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string().regex(UUID_RE).nullable(),
  items: z
    .array(z.object({ mealId: z.string().regex(UUID_RE), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  couponCode: z.string().trim().max(32).nullable(),
  tip: tipSchema,
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Error codes map to keys in messages/*.json "errors". */
export type QuoteError = { code: string; params?: Record<string, string | number> };

export type QuoteLine = {
  mealId: string;
  nameDe: string;
  nameEn: string;
  imagePath: string | null;
  unitPriceRappen: number;
  quantity: number;
  lineTotalRappen: number;
};

export type SlotOption = { id: string; startsAt: string; endsAt: string; availability: SlotAvailability };

export type Quote = {
  dates: string[];
  slots: SlotOption[];
  lines: QuoteLine[];
  breakdown: PriceBreakdown | null;
  coupon: { id: string; code: string } | null;
  couponError: QuoteError | null;
  /** Blocking problem: the order cannot be placed as is. */
  error: QuoteError | null;
};

const COUPON_ERROR_CODE: Record<CouponError, string> = {
  not_found: "coupon_not_found",
  inactive: "coupon_inactive",
  not_yet_valid: "coupon_not_yet_valid",
  expired: "coupon_expired",
  min_order: "coupon_min_order",
  exhausted: "coupon_exhausted",
  customer_limit: "coupon_customer_limit",
  first_order_only: "coupon_first_order_only",
};

async function couponUsage(couponId: string, userId: string | null) {
  const db = createAdminClient();
  const [{ count: totalUses }, customer, orders] = await Promise.all([
    db.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", couponId).is("released_at", null),
    userId
      ? db.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", couponId).eq("user_id", userId).is("released_at", null)
      : Promise.resolve({ count: 0 }),
    userId
      ? db
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("status", ["new", "accepted", "delivered", "refunded", "partially_refunded"])
      : Promise.resolve({ count: 0 }),
  ]);
  return { totalUses: totalUses ?? 0, customerUses: customer.count ?? 0, customerHasOrders: (orders.count ?? 0) > 0 };
}

export async function findCoupon(code: string): Promise<Coupon | null> {
  const { data } = await createAdminClient()
    .from("coupons")
    .select("*")
    .eq("code", normalizeCouponCode(code))
    .is("archived_at", null)
    .maybeSingle();
  return data as Coupon | null;
}

export async function buildQuote(input: QuoteInput, userId: string | null, now = new Date()): Promise<Quote> {
  const settings = await getSettings();
  const today = zurichNow(now).date;
  const dates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(today));
  const quote: Quote = { dates, slots: [], lines: [], breakdown: null, coupon: null, couponError: null, error: null };

  if (!dates.includes(input.date)) {
    quote.error = { code: "date_unavailable" };
    return quote;
  }

  // slots with live capacity
  const [slots, { data: counts }] = await Promise.all([
    getSlots(),
    createAdminClient().rpc("slot_order_counts", { p_from: input.date, p_to: input.date }),
  ]);
  const countFor = (slotId: string) => counts?.find((c) => c.slot_id === slotId)?.order_count ?? 0;
  quote.slots = slots
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, availability: getSlotAvailability(s, input.date, now, countFor(s.id)) }));

  if (input.slotId) {
    const slot = quote.slots.find((s) => s.id === input.slotId);
    if (!slot) quote.error = { code: "slot_unavailable" };
    else if (slot.availability === "full") quote.error = { code: "slot_full" };
    else if (slot.availability === "started") quote.error = { code: "slot_started" };
  }

  // items against today's menu and portions
  const menu = await getMenuForDate(input.date);
  const merged = new Map<string, number>();
  for (const item of input.items) merged.set(item.mealId, (merged.get(item.mealId) ?? 0) + item.quantity);
  for (const [mealId, quantity] of merged) {
    const entry = menu.find((m) => m.meal.id === mealId);
    if (!entry) {
      quote.error ??= { code: "meal_unavailable" };
      continue;
    }
    const { meal } = entry;
    if (entry.soldOut) quote.error ??= { code: "sold_out", params: { meal: meal.name_de, mealEn: meal.name_en } };
    else if (entry.portionsLeft !== null && quantity > entry.portionsLeft) {
      quote.error ??= { code: "not_enough", params: { meal: meal.name_de, mealEn: meal.name_en, count: entry.portionsLeft } };
    }
    quote.lines.push({
      mealId,
      nameDe: meal.name_de,
      nameEn: meal.name_en,
      imagePath: meal.image_path,
      unitPriceRappen: meal.price_rappen,
      quantity,
      lineTotalRappen: meal.price_rappen * quantity,
    });
  }

  const subtotal = quote.lines.reduce((s, l) => s + l.lineTotalRappen, 0);

  // coupon (an invalid coupon doesn't block the quote, it's just not applied)
  let coupon: Coupon | null = null;
  if (input.couponCode) {
    coupon = await findCoupon(input.couponCode);
    const result = validateCoupon(coupon, {
      today,
      subtotalRappen: subtotal,
      usage: coupon ? await couponUsage(coupon.id, userId) : { totalUses: 0, customerUses: 0, customerHasOrders: false },
    });
    if (result.ok && coupon) {
      quote.coupon = { id: coupon.id, code: coupon.code };
    } else if (!result.ok) {
      quote.couponError = {
        code: COUPON_ERROR_CODE[result.error],
        params: result.error === "min_order" && coupon ? { amount: formatCHF(coupon.min_order_rappen) } : undefined,
      };
      coupon = null;
    }
  }

  try {
    quote.breakdown = priceOrder({
      lines: quote.lines.map((l) => ({ unitPriceRappen: l.unitPriceRappen, quantity: l.quantity })),
      coupon: coupon ? couponToDiscount(coupon) : null,
      tip: input.tip,
      allowedTipPercents: settings.tip_percentages,
      deliveryFeeRappen: settings.delivery_fee_rappen,
      vatRateBp: settings.vat_rate_bp,
    });
  } catch (e) {
    if (e instanceof PricingError) {
      quote.error ??= { code: e.code === "invalid_tip" ? "invalid_tip" : "invalid_input" };
      return quote;
    }
    throw e;
  }

  if (subtotal < settings.min_order_rappen) {
    quote.error ??= { code: "min_order", params: { amount: formatCHF(settings.min_order_rappen) } };
  }
  if (quote.breakdown.totalRappen < STRIPE_MIN_CHARGE_RAPPEN) {
    quote.error ??= { code: "total_too_low" };
  }
  return quote;
}

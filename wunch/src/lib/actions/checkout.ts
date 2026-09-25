"use server";

import { z } from "zod";
import { getSessionUser } from "../auth";
import { getSettings } from "../data/settings";
import { env } from "../env";
import { expirePendingOrder } from "../orders/lifecycle";
import { type Quote, type QuoteError, buildQuote, quoteInputSchema } from "../orders/quote";
import { LIMITS, rateLimit, underLimit } from "../rate-limit";
import { clientIp } from "../request";
import { formatSlot } from "../format";
import { getStripe, isEmulator } from "../stripe/server";
import { createAdminClient } from "../supabase/admin";
import { UUID_RE, deliveryDetailsSchema } from "../validation";

export type QuoteResponse = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

/** Live price summary for the checkout page. */
export async function quoteCheckout(raw: unknown): Promise<QuoteResponse> {
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { code: "invalid_input" } };
  const ip = await clientIp();
  if (!(await rateLimit(`quote:ip:${ip}`, LIMITS.quotePerIp.max, LIMITS.quotePerIp.window))) {
    return { ok: false, error: { code: "rate_limited" } };
  }
  const user = await getSessionUser();
  // Guessing coupon codes: after too many unknown codes, no code is looked up at all
  if (parsed.data.couponCode && !(await couponGuessingAllowed(ip, user?.id ?? null))) {
    return { ok: false, error: { code: "rate_limited" } };
  }
  const quote = await buildQuote(parsed.data, user?.id ?? null);
  if (quote.couponError?.code === "coupon_not_found") await countCouponMiss(ip, user?.id ?? null);
  return { ok: true, quote };
}

async function couponGuessingAllowed(ip: string, userId: string | null): Promise<boolean> {
  const okIp = await underLimit(`coupon-fail:ip:${ip}`, LIMITS.couponFailuresPerIp.max, LIMITS.couponFailuresPerIp.window);
  const okUser = userId ? await underLimit(`coupon-fail:user:${userId}`, LIMITS.couponFailuresPerUser.max, LIMITS.couponFailuresPerUser.window) : true;
  return okIp && okUser;
}

async function countCouponMiss(ip: string, userId: string | null): Promise<void> {
  await rateLimit(`coupon-fail:ip:${ip}`, LIMITS.couponFailuresPerIp.max, LIMITS.couponFailuresPerIp.window);
  if (userId) await rateLimit(`coupon-fail:user:${userId}`, LIMITS.couponFailuresPerUser.max, LIMITS.couponFailuresPerUser.window);
}

const placeOrderSchema = quoteInputSchema.extend({
  slotId: z.string().regex(UUID_RE),
  details: deliveryDetailsSchema,
  saveToProfile: z.boolean(),
  expectedTotalRappen: z.number().int(),
  locale: z.enum(["de", "en"]),
});

export type PlaceOrderResponse =
  | { ok: true; orderId: string; clientSecret: string; totalRappen: number }
  | { ok: false; error: QuoteError; quote?: Quote; fields?: string[] };

const DB_ERRORS = new Set([
  "empty_cart",
  "date_closed",
  "slot_unavailable",
  "slot_started",
  "slot_full",
  "invalid_quantity",
  "meal_unavailable",
  "price_changed",
  "amount_mismatch",
  "sold_out",
  "coupon_invalid",
  "coupon_exhausted",
  "coupon_customer_limit",
  "coupon_first_order_only",
]);

/**
 * Create the order (reserving portions, slot and coupon atomically in
 * Postgres) and a PaymentIntent with manual capture. The browser then
 * confirms the payment with Stripe; the webhook moves the order to "new".
 */
export async function placeOrder(raw: unknown): Promise<PlaceOrderResponse> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: { code: "not_signed_in" } };

  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.filter((i) => i.path[0] === "details").map((i) => String(i.path[1]));
    return { ok: false, error: { code: "invalid_input" }, fields };
  }
  const input = parsed.data;

  const ip = await clientIp();
  const allowed =
    (await rateLimit(`checkout:user:${user.id}`, LIMITS.checkoutPerUser.max, LIMITS.checkoutPerUser.window)) &&
    (await rateLimit(`checkout:ip:${ip}`, LIMITS.checkoutPerIp.max, LIMITS.checkoutPerIp.window));
  if (!allowed) return { ok: false, error: { code: "rate_limited" } };

  const settings = await getSettings();
  if (!settings.delivery_postcodes.includes(input.details.postcode)) {
    return { ok: false, error: { code: "postcode_not_served", params: { postcodes: settings.delivery_postcodes.join(", ") } }, fields: ["postcode"] };
  }

  if (input.couponCode && !(await couponGuessingAllowed(ip, user.id))) return { ok: false, error: { code: "rate_limited" } };
  const quote = await buildQuote(input, user.id);
  if (quote.couponError?.code === "coupon_not_found") await countCouponMiss(ip, user.id);
  if (quote.error) return { ok: false, error: quote.error, quote };
  if (input.couponCode && quote.couponError) return { ok: false, error: quote.couponError, quote };
  const b = quote.breakdown!;
  if (b.totalRappen !== input.expectedTotalRappen) return { ok: false, error: { code: "total_changed" }, quote };

  const db = createAdminClient();
  const actor = { type: "customer" as const, id: user.id, label: user.email };

  // One open checkout per customer: earlier unfinished attempts give their portions back
  const { data: open } = await db.from("orders").select("*").eq("user_id", user.id).eq("status", "pending_payment");
  for (const o of open ?? []) await expirePendingOrder(o, actor, "Replaced by a newer checkout");

  const d = input.details;
  const { data: created, error } = await db.rpc("create_order", {
    p_user_id: user.id,
    p_delivery_date: input.date,
    p_slot_id: input.slotId,
    p_items: quote.lines.map((l) => ({ meal_id: l.mealId, quantity: l.quantity, unit_price_rappen: l.unitPriceRappen })),
    p_details: {
      customer_name: d.fullName,
      customer_email: user.email,
      company: d.company,
      street: d.street,
      postcode: d.postcode,
      city: d.city,
      floor_room: d.floorRoom,
      phone: d.phone,
      delivery_note: d.deliveryNote,
    },
    p_amounts: {
      subtotal: b.subtotalRappen,
      discount: b.discountRappen,
      delivery_fee: b.deliveryFeeRappen,
      tip: b.tipRappen,
      tip_percent: b.tipPercent,
      total: b.totalRappen,
      vat_rate_bp: b.vatRateBp,
      vat: b.vatRappen,
    },
    // SQL accepts null (no coupon); the generated type is stricter than the function
    p_coupon_id: (quote.coupon?.id ?? null) as string,
    p_locale: input.locale,
  });

  if (error || !created?.[0]) {
    const [code, mealId] = (error?.message ?? "").split(":");
    if (DB_ERRORS.has(code)) {
      const line = quote.lines.find((l) => l.mealId === mealId);
      return {
        ok: false,
        error: { code: code === "amount_mismatch" ? "price_changed" : code, params: line ? { meal: line.nameDe, mealEn: line.nameEn } : undefined },
      };
    }
    console.error("create_order failed", error);
    return { ok: false, error: { code: "generic" } };
  }

  const { order_id: orderId, order_number: orderNumber } = created[0];
  const slot = quote.slots.find((s) => s.id === input.slotId);

  let clientSecret: string | null = null;
  try {
    const pi = await getStripe().paymentIntents.create(
      {
        amount: b.totalRappen,
        currency: "chf",
        capture_method: "manual",
        payment_method_types: ["card"],
        description: `wunch #${orderNumber}, ${input.date}${slot ? ` ${formatSlot(slot.startsAt, slot.endsAt)}` : ""}`,
        metadata: {
          order_id: orderId,
          order_number: String(orderNumber),
          delivery_date: input.date,
          slot: slot ? formatSlot(slot.startsAt, slot.endsAt) : "",
          customer_email: user.email,
          subtotal_rappen: String(b.subtotalRappen),
          discount_rappen: String(b.discountRappen),
          coupon_code: quote.coupon?.code ?? "",
          delivery_fee_rappen: String(b.deliveryFeeRappen),
          tip_rappen: String(b.tipRappen),
          total_rappen: String(b.totalRappen),
        },
      },
      { idempotencyKey: `order-${orderId}` },
    );
    // Only attach the payment while this order is still the open checkout; a
    // parallel checkout (second tab) may have replaced it in the meantime.
    const { data: attached, error: attachError } = await db
      .from("orders")
      .update({ stripe_payment_intent_id: pi.id })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select("id");
    if (attachError || !attached?.length) {
      await getStripe().paymentIntents.cancel(pi.id).catch(() => undefined);
      return { ok: false, error: { code: "payment_setup_failed" } };
    }
    clientSecret = pi.client_secret;
  } catch (e) {
    console.error("PaymentIntent create failed", e);
    const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
    if (order) await expirePendingOrder(order, actor, "Could not start the payment");
    return { ok: false, error: { code: "payment_setup_failed" } };
  }

  if (input.saveToProfile) {
    await db
      .from("profiles")
      .update({
        full_name: d.fullName,
        company: d.company || null,
        street: d.street,
        postcode: d.postcode,
        city: d.city,
        floor_room: d.floorRoom || null,
        phone: d.phone,
        delivery_note: d.deliveryNote || null,
        locale: input.locale,
      })
      .eq("id", user.id);
  }

  return { ok: true, orderId, clientSecret: clientSecret!, totalRappen: b.totalRappen };
}

/**
 * Local testing only: "pays" with a test card on the Stripe emulator. The
 * emulator then sends the same signed webhook Stripe would.
 */
export async function emulatorConfirm(clientSecret: string, outcome: "success" | "decline"): Promise<{ ok: boolean }> {
  if (!isEmulator()) return { ok: false };
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const res = await fetch(`${env().STRIPE_API_BASE_URL}/_emulator/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_secret: clientSecret, outcome }),
  });
  const body = (await res.json()) as { ok?: boolean };
  return { ok: res.ok && body.ok === true };
}

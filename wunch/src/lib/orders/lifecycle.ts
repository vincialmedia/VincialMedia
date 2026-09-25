import "server-only";
import type Stripe from "stripe";
import {
  notifyAdminNewOrder,
  notifyOrderAccepted,
  notifyOrderAutoCancelled,
  notifyOrderReceived,
  notifyOrderRejected,
  notifyRefund,
} from "../email/notify";
import { getStripe } from "../stripe/server";
import { createAdminClient } from "../supabase/admin";
import type { Database, Tables } from "../supabase/database.types";

export type Order = Tables<"orders">;
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type Actor = { type: "admin" | "system" | "stripe" | "customer"; id?: string | null; label?: string | null };
export type ActionResult = { ok: true } | { ok: false; error: string; message?: string };

const db = () => createAdminClient();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export async function getOrder(orderId: string): Promise<Order | null> {
  const { data } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  return data;
}

async function getOrderForPaymentIntent(pi: Pick<Stripe.PaymentIntent, "id" | "metadata">): Promise<Order | null> {
  const { data } = await db().from("orders").select("*").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (data) return data;
  const orderId = pi.metadata?.order_id;
  return orderId ? getOrder(orderId) : null;
}

async function transition(
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string; patch?: Record<string, unknown>; kind?: "status" | "payment" | "note"; data?: Record<string, unknown> } = {},
): Promise<Order | null> {
  const { data, error } = await db().rpc("transition_order", {
    p_order_id: orderId,
    p_from: from,
    p_to: to,
    p_actor_type: actor.type,
    p_actor_id: actor.id ?? undefined,
    p_actor_label: actor.label ?? undefined,
    p_note: opts.note,
    p_patch: (opts.patch ?? {}) as Database["public"]["Functions"]["transition_order"]["Args"]["p_patch"],
    p_event_kind: opts.kind ?? "status",
    p_event_data: (opts.data ?? {}) as Database["public"]["Functions"]["transition_order"]["Args"]["p_event_data"],
  });
  if (error) throw new Error(`transition_order failed: ${error.message}`);
  const row = data as Order | null;
  return row && row.id ? row : null;
}

async function addNote(orderId: string, actor: Actor, note: string, data: Record<string, unknown> = {}) {
  await db().from("order_events").insert({
    order_id: orderId,
    kind: "note",
    actor_type: actor.type,
    actor_id: actor.id ?? null,
    actor_label: actor.label ?? null,
    note,
    data: data as never,
  });
}

async function claim(orderId: string, statuses: OrderStatus[]): Promise<boolean> {
  const { data } = await db().rpc("claim_order_action", { p_order_id: orderId, p_statuses: statuses, p_seconds: 60 });
  return data === true;
}

async function unclaim(orderId: string) {
  await db().rpc("release_order_action", { p_order_id: orderId });
}

/** Thrown to make Stripe retry a webhook later (the route answers 500). */
export class RetryLaterError extends Error {}

/** An admin click or the cron job is calling Stripe for this order right now. */
function isBeingProcessed(order: Order): boolean {
  return !!order.action_lock_until && new Date(order.action_lock_until).getTime() > Date.now();
}

function stripeMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Cancel a PaymentIntent, treating "already canceled" as success. */
async function cancelPaymentIntent(piId: string): Promise<"canceled" | "captured" | "error"> {
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(piId);
    return "canceled";
  } catch (e) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === "canceled") return "canceled";
      if (pi.status === "succeeded") return "captured";
    } catch {
      // fall through
    }
    console.error("cancel PaymentIntent failed", piId, stripeMessage(e));
    return "error";
  }
}

/** Stripe fee and payout for a captured PaymentIntent (from the balance transaction). */
async function fetchSettlement(piId: string) {
  const pi = await getStripe().paymentIntents.retrieve(piId, { expand: ["latest_charge.balance_transaction"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
  return {
    chargeId: charge?.id ?? null,
    captured: charge?.amount_captured ?? pi.amount_received,
    fee: bt ? bt.fee : null,
    net: bt ? bt.net : null,
  };
}

// ---------------------------------------------------------------------------
// Stripe -> app (webhooks, and the success page as a fallback)
// ---------------------------------------------------------------------------

/** Card authorised (hold placed): order becomes "new" and both sides get an email. */
export async function markAuthorized(piRef: Pick<Stripe.PaymentIntent, "id" | "metadata">, actor: Actor): Promise<void> {
  const order = await getOrderForPaymentIntent(piRef);
  if (!order) return;
  if (order.status !== "pending_payment") {
    if (order.status === "expired" || order.status === "payment_failed") {
      // The checkout was given up on (portions released) but the bank said yes late: release the hold.
      const result = await cancelPaymentIntent(piRef.id);
      if (result === "error") throw new RetryLaterError(`could not release late hold ${piRef.id}`);
      if (result === "canceled") await addNote(order.id, actor, "Late authorisation for an abandoned checkout: hold released.");
    }
    return;
  }

  const pi = await getStripe().paymentIntents.retrieve(piRef.id, { expand: ["latest_charge"] });
  if (pi.status !== "requires_capture") return;

  if (pi.amount !== order.total_rappen || pi.currency !== "chf") {
    await cancelPaymentIntent(pi.id);
    await transition(order.id, ["pending_payment"], "payment_failed", actor, {
      note: `Amount mismatch: Stripe ${pi.amount} ${pi.currency}, order ${order.total_rappen}. Hold released.`,
    });
    return;
  }

  const charge = pi.latest_charge as Stripe.Charge | null;
  const captureBefore = charge?.payment_method_details?.card?.capture_before;
  const updated = await transition(order.id, ["pending_payment"], "new", actor, {
    kind: "payment",
    note: "Card authorised",
    patch: {
      authorized_at: new Date().toISOString(),
      capture_before: captureBefore ? new Date(captureBefore * 1000).toISOString() : null,
      stripe_charge_id: charge?.id ?? null,
      stripe_payment_intent_id: pi.id,
    },
  });
  if (updated) {
    await Promise.all([notifyOrderReceived(updated.id), notifyAdminNewOrder(updated.id)]);
  }
}

/** Card declined or authentication failed. The next checkout attempt starts a fresh order. */
export async function markPaymentFailed(pi: Stripe.PaymentIntent, actor: Actor): Promise<void> {
  const order = await getOrderForPaymentIntent(pi);
  if (!order || order.status !== "pending_payment") return;
  const updated = await transition(order.id, ["pending_payment"], "payment_failed", actor, {
    kind: "payment",
    note: pi.last_payment_error?.message ?? "Payment failed",
    data: { code: pi.last_payment_error?.code ?? null, decline_code: pi.last_payment_error?.decline_code ?? null },
  });
  if (updated) await cancelPaymentIntent(pi.id);
}

/** PaymentIntent canceled outside the app (Dashboard, or the hold expired). */
export async function markCanceledByStripe(pi: Stripe.PaymentIntent, actor: Actor): Promise<void> {
  const order = await getOrderForPaymentIntent(pi);
  if (!order) return;
  if (order.status === "pending_payment") {
    await transition(order.id, ["pending_payment"], "expired", actor, { note: `PaymentIntent canceled (${pi.cancellation_reason ?? "no reason"})` });
  } else if (order.status === "new") {
    // Our own reject/auto-cancel is mid-way (it cancelled the payment and is about
    // to record why): let it finish, Stripe will retry this event.
    if (isBeingProcessed(order)) throw new RetryLaterError(`order ${order.id} is being processed`);
    const updated = await transition(order.id, ["new"], "auto_cancelled", actor, {
      note: `Hold released by Stripe (${pi.cancellation_reason ?? "no reason"})`,
      patch: { cancelled_at: new Date().toISOString() },
    });
    if (updated) await notifyOrderAutoCancelled(updated.id);
  }
}

/** Captured outside the app (e.g. in the Stripe Dashboard). */
export async function markSucceededByStripe(pi: Stripe.PaymentIntent, actor: Actor): Promise<void> {
  const order = await getOrderForPaymentIntent(pi);
  if (!order || order.status !== "new") return;
  if (isBeingProcessed(order)) throw new RetryLaterError(`order ${order.id} is being processed`);
  const s = await fetchSettlement(pi.id);
  const updated = await transition(order.id, ["new"], "accepted", actor, {
    note: "Captured outside wunch",
    patch: {
      accepted_at: new Date().toISOString(),
      amount_captured_rappen: s.captured,
      stripe_fee_rappen: s.fee,
      stripe_net_rappen: s.net,
      stripe_charge_id: s.chargeId,
    },
  });
  if (updated) await notifyOrderAccepted(updated.id);
}

/** Keep the order in sync with the refunded total on the charge. */
export async function syncRefundFromCharge(charge: Stripe.Charge, actor: Actor): Promise<void> {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const order = await getOrderForPaymentIntent({ id: piId, metadata: {} });
  if (!order) return;
  const { data: delta, error } = await db().rpc("apply_refund_total", {
    p_order_id: order.id,
    p_amount_refunded: charge.amount_refunded,
    p_actor_type: actor.type,
    p_actor_id: actor.id ?? undefined,
    p_actor_label: actor.label ?? undefined,
  });
  if (error) throw new Error(`apply_refund_total failed: ${error.message}`);
  if (delta && delta > 0) await notifyRefund(order.id, delta, `${charge.id}:${charge.amount_refunded}`);
}

/**
 * Pull the current PaymentIntent state from Stripe for an order that is still
 * pending. Makes the success page and the cron job independent of webhook timing.
 */
export async function syncPendingOrder(order: Order, actor: Actor): Promise<void> {
  if (order.status !== "pending_payment" || !order.stripe_payment_intent_id) return;
  const pi = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id);
  if (pi.status === "requires_capture") await markAuthorized(pi, actor);
  else if (pi.status === "canceled") await markCanceledByStripe(pi, actor);
  else if (pi.status === "requires_payment_method" && pi.last_payment_error) await markPaymentFailed(pi, actor);
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

/** Accept: capture the held amount, then email the receipt. */
export async function acceptOrder(orderId: string, actor: Actor): Promise<ActionResult> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "new") return { ok: false, error: "wrong_status" };
  if (!order.stripe_payment_intent_id) return { ok: false, error: "no_payment" };
  if (!(await claim(orderId, ["new"]))) return { ok: false, error: "busy" };

  try {
    await getStripe().paymentIntents.capture(order.stripe_payment_intent_id, {}, { idempotencyKey: `capture-${orderId}` });
  } catch (e) {
    await unclaim(orderId);
    // If the hold is gone, say so and cancel the order cleanly
    const pi = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id).catch(() => null);
    if (pi?.status === "canceled") {
      const updated = await transition(orderId, ["new"], "auto_cancelled", actor, {
        note: "Capture failed: the card hold had already been released.",
        patch: { cancelled_at: new Date().toISOString() },
      });
      if (updated) await notifyOrderAutoCancelled(orderId);
      return { ok: false, error: "hold_expired" };
    }
    return { ok: false, error: "stripe_error", message: stripeMessage(e) };
  }

  const s = await fetchSettlement(order.stripe_payment_intent_id).catch(() => null);
  const updated = await transition(orderId, ["new"], "accepted", actor, {
    note: "Accepted, payment captured",
    patch: {
      accepted_at: new Date().toISOString(),
      amount_captured_rappen: s?.captured ?? order.total_rappen,
      stripe_fee_rappen: s?.fee ?? null,
      stripe_net_rappen: s?.net ?? null,
      stripe_charge_id: s?.chargeId ?? order.stripe_charge_id,
    },
  });
  if (updated) await notifyOrderAccepted(orderId);
  return { ok: true };
}

/** Reject: cancel the PaymentIntent so the hold is released right away. */
export async function rejectOrder(orderId: string, reason: string, actor: Actor): Promise<ActionResult> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "new") return { ok: false, error: "wrong_status" };
  if (!(await claim(orderId, ["new"]))) return { ok: false, error: "busy" };

  if (order.stripe_payment_intent_id) {
    const result = await cancelPaymentIntent(order.stripe_payment_intent_id);
    if (result !== "canceled") {
      await unclaim(orderId);
      if (result === "captured") {
        // the money was already taken (e.g. an earlier accept crashed halfway): show it as accepted
        await markSucceededByStripe(await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id), actor);
        return { ok: false, error: "already_captured" };
      }
      return { ok: false, error: "stripe_error" };
    }
  }
  const updated = await transition(orderId, ["new"], "rejected", actor, {
    note: reason,
    patch: { reject_reason: reason, cancelled_at: new Date().toISOString() },
  });
  if (updated) await notifyOrderRejected(orderId);
  return { ok: true };
}

export async function markDelivered(orderId: string, actor: Actor): Promise<ActionResult> {
  const updated = await transition(orderId, ["accepted"], "delivered", actor, {
    patch: { delivered_at: new Date().toISOString() },
  });
  return updated ? { ok: true } : { ok: false, error: "wrong_status" };
}

/** Full (amount = null) or partial refund after capture. */
export async function refundOrder(orderId: string, amountRappen: number | null, actor: Actor, reason?: string): Promise<ActionResult> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "not_found" };
  if (!["accepted", "delivered", "partially_refunded"].includes(order.status) || !order.stripe_payment_intent_id) {
    return { ok: false, error: "wrong_status" };
  }
  const refundable = order.amount_captured_rappen - order.amount_refunded_rappen;
  const amount = amountRappen ?? refundable;
  if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) return { ok: false, error: "invalid_amount" };

  const stripe = getStripe();
  try {
    await stripe.refunds.create(
      { payment_intent: order.stripe_payment_intent_id, amount, reason: "requested_by_customer", metadata: { order_id: orderId, note: reason ?? "" } },
      // same click twice = one refund
      { idempotencyKey: `refund-${orderId}-${order.amount_refunded_rappen}-${amount}` },
    );
  } catch (e) {
    return { ok: false, error: "stripe_error", message: stripeMessage(e) };
  }
  const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  if (charge) await syncRefundFromCharge(charge, actor);
  if (reason) await addNote(orderId, actor, reason);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scheduled job
// ---------------------------------------------------------------------------

/** Nobody decided in time: release the hold and tell the customer. */
export async function autoCancelOrder(orderId: string, why: string, actor: Actor): Promise<ActionResult> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "new") return { ok: false, error: "wrong_status" };
  if (!(await claim(orderId, ["new"]))) return { ok: false, error: "busy" };
  if (order.stripe_payment_intent_id) {
    const result = await cancelPaymentIntent(order.stripe_payment_intent_id);
    if (result !== "canceled") {
      await unclaim(orderId);
      if (result === "captured") {
        // already captured (accept crashed after capture, webhook lost): record the acceptance
        await markSucceededByStripe(await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id), actor);
      }
      return { ok: false, error: result };
    }
  }
  const updated = await transition(orderId, ["new"], "auto_cancelled", actor, {
    note: why,
    patch: { cancelled_at: new Date().toISOString() },
  });
  if (updated) await notifyOrderAutoCancelled(orderId);
  return { ok: true };
}

/** A checkout that never got authorised: release portions (after one last look at Stripe). */
export async function expirePendingOrder(order: Order, actor: Actor, note: string): Promise<void> {
  if (order.stripe_payment_intent_id) {
    // if Stripe can't be reached, don't guess: the next run tries again
    const pi = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (pi.status === "requires_capture") {
      await markAuthorized(pi, actor); // the webhook got lost: treat it as authorised
      return;
    }
    if (pi.status === "succeeded") {
      await markSucceededByStripe(pi, actor);
      return;
    }
    if (pi.status !== "canceled" && (await cancelPaymentIntent(pi.id)) === "error") {
      throw new Error(`could not cancel ${pi.id}`);
    }
  }
  await transition(order.id, ["pending_payment"], "expired", actor, { note });
}

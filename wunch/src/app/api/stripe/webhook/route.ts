import type Stripe from "stripe";
import { env } from "@/lib/env";
import {
  type Actor,
  markAuthorized,
  markCanceledByStripe,
  markPaymentFailed,
  markSucceededByStripe,
  syncRefundFromCharge,
} from "@/lib/orders/lifecycle";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Stripe webhooks. Signature verified, event ids stored in stripe_events so
 * duplicates are skipped. A failed event returns 500 and Stripe retries it.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env().STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  const db = createAdminClient();
  const { error: insertError } = await db.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    stripe_created_at: new Date(event.created * 1000).toISOString(),
  });
  if (insertError) {
    if (insertError.code !== "23505") return new Response("could not record event", { status: 500 });
    const { data: seen } = await db.from("stripe_events").select("processed_at").eq("id", event.id).single();
    if (seen?.processed_at) return Response.json({ received: true, duplicate: true });
    // seen before but not finished (a previous attempt failed): process again
  }

  const actor: Actor = { type: "stripe", label: `${event.type} ${event.id}` };
  try {
    switch (event.type) {
      case "payment_intent.amount_capturable_updated":
        await markAuthorized(event.data.object, actor);
        break;
      case "payment_intent.payment_failed":
        await markPaymentFailed(event.data.object, actor);
        break;
      case "payment_intent.canceled":
        await markCanceledByStripe(event.data.object, actor);
        break;
      case "payment_intent.succeeded":
        await markSucceededByStripe(event.data.object, actor);
        break;
      case "charge.refunded":
        await syncRefundFromCharge(event.data.object, actor);
        break;
      default:
        break; // not interesting for wunch
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`webhook ${event.type} ${event.id} failed`, message);
    await db.from("stripe_events").update({ error: message.slice(0, 1000) }).eq("id", event.id);
    return new Response("handler failed", { status: 500 });
  }

  await db.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
  return Response.json({ received: true });
}
